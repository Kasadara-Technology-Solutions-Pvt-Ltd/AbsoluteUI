# Virtual List

> Package: `@absoluteui/components/virtual-list` | Styles: `@absoluteui/components/virtual-list/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Renders only the visible items, plus an overscan, of very large lists: 100,000 items and more, with fixed or measured variable heights. A selectable list is a WAI-ARIA listbox with single or multiple selection, type-ahead, and roving focus; otherwise it is a plain `role="list"`. The focused item always stays rendered, so focus is never lost while scrolling. `aui-range-change` reports the visible range for lazy loading, and the optional `loadMore` hook adds infinite scroll with a polite status message. Tree View, Command Palette, Transfer List, and File Manager build on the same windowing engine.

## 2. Anatomy

```text
<div class="aui-virtual-list aui-virtual-list--selectable">
  <div class="aui-virtual-list__viewport" role="listbox" aria-label="Employees" aria-multiselectable="true">   (scroll container)
    <div class="aui-virtual-list__canvas" role="none">                                                       (full height of all items)
      <div class="aui-virtual-list__item" role="option" aria-selected="false" aria-posinset="41" aria-setsize="10000" tabindex="-1">renderItem()</div>
      <div class="aui-virtual-list__item aui-virtual-list__item--active" role="option" aria-selected="true" tabindex="0">...</div>
    </div>
  </div>
  <div class="aui-virtual-list__empty" hidden>No items</div>
  <div class="aui-virtual-list__status" role="status">Loading more items</div>
</div>
```

## 3. When to use

- Lists of hundreds to millions of items, such as people, files, or log lines.
- A selectable list in a sidebar or picker that must stay fast with large data.
- Infinite scroll over a paged API.

## 4. When not to use

- Short lists (under a few hundred items): render them directly or use Sortable List.
- Tabular data with columns, sorting, and filters: use Data Table or Data Grid (both virtualize).
- Lists users must print or search with the browser's find: only visible items are in the DOM.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `value` | `readonly string[]` | Keys of the selected items. |
| `range` | `WindowRange` | The visible items `{ start, end }` (end exclusive). |
| `activeIndex` | `number` | Index of the focusable item in a listbox, or -1. |
| `options` | `Readonly<VirtualListOptions<Item>>` | Current options. |

Options (`VirtualListOptions<Item>`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the list. |
| `items` | `readonly Item[]` | - (required) | No | The items (up to 1,000,000; see section 26). |
| `renderItem` | `(item, index) => Node` | - (required) | No | Content of one item; called whenever it is rendered. |
| `itemKey` | `(item, index) => string` | index | No | Stable key per item, used by `value`. |
| `itemText` | `(item, index) => string` | strings, numbers, `label` | No | Type-ahead text. |
| `itemHeight` | `number` | 32 / 40 / 48 by density | No | Item height in pixels; the estimate with `variableHeight`. |
| `variableHeight` | `boolean` | `false` | No | Measure every rendered item. |
| `height` | `string \| null` | `'20rem'` | No | Block size of the scroll area, or `null` to fill the host. |
| `selection` | `'none' \| 'single' \| 'multiple'` | `'none'` | No | `none` is a plain list; the others a listbox. |
| `value` | `readonly string[]` | `[]` | No | Keys of the selected items. |
| `selectionFollowsFocus` | `boolean` | `false` | No | Single selection: moving focus also selects. |
| `isDisabled` | `(item, index) => boolean` | - | No | Items that cannot be selected or focused. |
| `empty` | `Node \| string` | `'No items'` | No | Shown instead of the list when there are no items. |
| `loadMore` | `(() => Promise<void> \| void) \| null` | - | No | Called near the end; resolve after `update({ items })`. |
| `hasMore` | `boolean` | `true` | No | More items can be loaded. |
| `loadMoreThreshold` | `number` | `10` | No | Items from the end at which loading starts. |
| `overscan` | `number` | `5` | Yes | Items rendered beyond each edge (0 to 100). |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the status messages. |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | common `density` | Yes (inherited) | Default item height. |

## 6. Methods

| Method | Description |
|---|---|
| `VirtualList.create(host, options)` | Render into `host` (children are replaced). |
| `scrollToIndex(index, align?)` | Scroll so the item is visible; `align` is `auto` (default, only as far as needed), `start`, `center`, or `end`. |
| `focusItem(index)` | Focus an item of a listbox, scrolling it into view. |
| `getItemElement(index)` | The rendered element of an item, or `null`. |
| `setValue(keys)` | Select by keys (no event). |
| `refresh()` | Render the visible items again after item objects changed in place. |
| `update(options)` | Merge and apply options. New `items` keep the scroll position. |
| `destroy()` | Remove rendering, observers, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: string[], index: number }` | The user changed the selection (click, Space, Enter, Shift ranges, Ctrl+A, or focus with `selectionFollowsFocus`). |
| `aui-range-change` | `{ start, end, renderedStart, renderedEnd }` | The visible range changed (scrolling, resizing, new items); use it to fetch data for the visible items. |

## 8. Slots/content areas

`renderItem(item, index)` returns each item's content as a `Node`; `empty` is shown when there are no items (text or a Node, such as an Empty State host).

## 9. CSS parts/hooks

`aui-virtual-list`, `aui-virtual-list--selectable`, `aui-virtual-list--variable`, `aui-virtual-list--fill`, `aui-virtual-list--empty`, `aui-virtual-list__viewport`, `aui-virtual-list__canvas`, `aui-virtual-list__item`, `aui-virtual-list__item--selected`, `aui-virtual-list__item--active`, `aui-virtual-list__empty`, `aui-virtual-list__status`, `aui-virtual-list__status--visible`, `aui-virtual-list__status--error`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/virtual-list/tokens.json` (verified in CI). Component tokens: `--aui-virtual-list-radius` (falls back to `radius-md`) and `--aui-virtual-list-border-color` (`color-border`, decorative). Selected items use `color-selected`, `color-selected-text`, and `color-selected-indicator`.

## 11. States

Plain list; single or multiple selection; disabled items; variable heights; loading more; load failed; empty.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | scroll or resize | new window rendered; `aui-range-change` when the visible range changed |
| near the end | `loadMore` set and `hasMore` not false | loading (status "Loading more items", `aria-busy`), then loaded or failed |
| unselected | click, Space, Enter | selected; `aui-change` |
| items | `update({ items: [] })` | empty content shown |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Listbox | Focus the active item (one tab stop); a plain list focuses its scroll container. |
| Down / Up | Listbox | Next or previous enabled item. |
| Home / End | Listbox | First or last enabled item. |
| Page Down / Page Up | Listbox | Move by one visible page. |
| Space / Enter | Listbox | Select (single) or toggle (multiple) the focused item. |
| Shift + Down / Up / Home / End / Space | Multiple selection | Select the range from the anchor to the focused item. |
| Ctrl + A (Cmd + A) | Multiple selection | Select all enabled items, or clear them when all are selected. |
| Printable characters | Listbox | Type-ahead to the next matching item. |
| Arrow and Page keys | Plain list | Scroll natively. |

## 14. ARIA contract

- Viewport: `role="listbox"` (selectable) or `role="list"`, `aria-label`, `aria-multiselectable="true"` with multiple selection, `aria-busy="true"` while loading.
- Items: `role="option"` with `aria-selected` and `aria-disabled`, or `role="listitem"`; every item has `aria-posinset` and `aria-setsize` (`-1` while more can be loaded), because only part of the list is in the DOM.
- The canvas has `role="none"`; the status element is `role="status"`.
- With no items the listbox role is removed and the empty content is shown (an empty listbox is not valid).

## 15. Accessibility notes

- The focused item always stays rendered, even when scrolled far away, so focus is never lost (WCAG 2.4.3).
- Selection is shown by a start-edge bar as well as color (WCAG 1.4.1).
- Loading progress and failures are announced politely (WCAG 4.1.3).
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Fills the inline size of its host; the block size comes from `height`, or from the host with `height: null` (for example a Splitter pane). The rendered window follows the viewport size.

## 17. RTL behavior

Items, text, and the selection bar follow the writing direction; the scrollbar sits where the browser places it.

## 18. Theme behavior

Three themes through the role tokens; selected items stay legible in high contrast. Forced colors use `Highlight`, `HighlightText`, and `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { virtualList: { overscan: 10 } } });
```

## 20. Component configuration support

Instance `overscan`, `locale`, and `density` override configuration; configuration changes lay out existing lists again.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

Items are DOM nodes built by the application's `renderItem`; the component never parses HTML. Status messages are set as text.

## 24. Data handling behavior

No persistence, network access, or telemetry. `loadMore` is the application's own function.

## 25. Performance characteristics

Offsets are prefix sums in typed arrays, rebuilt lazily from the first changed size; lookups by scroll position are binary searches. Only `visible + 2 x overscan + 1` item elements exist; elements are recycled as the window moves. Variable heights are measured once per rendering and observed for later changes, keeping the visible content anchored.

## 26. Supported data scale

Tested with 100,000 fixed-height and variable-height items. The option limit is 1,000,000 items, and the total height (items x item height) must stay under the browser's maximum element height: about 17.9 million px in Firefox and 33.5 million px in Chromium. 400,000 items of 40 px work in every supported browser.

## 27. Usage examples

```ts
import { VirtualList, type VirtualListRangeChangeDetail } from '@absoluteui/components/virtual-list';

const host = document.querySelector<HTMLElement>('#log');
if (host) {
  const lines = Array.from({ length: 250_000 }, (_, i) => `Line ${String(i + 1)}`);
  VirtualList.create<string>(host, { label: 'Build log', items: lines, renderItem: (line) => document.createTextNode(line) });
  host.addEventListener('aui-range-change', (event) => {
    const { start, end } = (event as CustomEvent<VirtualListRangeChangeDetail>).detail;
    host.dataset.visible = `${String(start + 1)}-${String(end)}`;
  });
}
```

More examples, type-checked in CI: `metadata/virtual-list/examples.json`.

## 28. Edge cases

- `update({ items })` keeps the scroll position, measured sizes of unchanged indexes, and selected keys (keys of removed items stay selected until `setValue`).
- A `loadMore` that resolves without new items is not called again until the user scrolls.
- With `height: null`, a host without a height renders an empty viewport; give the host a block size.
- Single selection rejects more than one key in `value`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `VIRTUAL_LIST_OPTIONS` | configuration | Blank label, items not an array or more than 1,000,000, a missing `renderItem`, an `itemHeight` outside 8 to 2000, a `height` that is not a CSS length, an unknown `selection`, or `value` with non-string keys. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Vertical lists only.
- The total height must stay under the browser's maximum element height (section 26).
- Only rendered items are in the DOM, so find-in-page and printing see only those.
- Variable heights are estimated until an item has been rendered once.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Horizontal or grid virtualization.
- Drag-and-drop reordering (use Sortable List for short lists).

## 32. TypeScript definitions

```ts
type VirtualListSelection = 'none' | 'single' | 'multiple';
interface VirtualListConfig { overscan: number }
interface VirtualListOptions<Item = unknown> extends Partial<VirtualListConfig> {
  label: string;
  items: readonly Item[];
  renderItem: (item: Item, index: number) => Node;
  itemKey?: (item: Item, index: number) => string;
  itemText?: (item: Item, index: number) => string;
  itemHeight?: number;
  variableHeight?: boolean;
  height?: string | null;
  selection?: VirtualListSelection;
  value?: readonly string[];
  selectionFollowsFocus?: boolean;
  isDisabled?: (item: Item, index: number) => boolean;
  empty?: Node | string;
  loadMore?: (() => Promise<void> | void) | null;
  hasMore?: boolean;
  loadMoreThreshold?: number;
  locale?: string;
  density?: Density;
}
interface VirtualListChangeDetail { value: string[]; index: number }
interface VirtualListRangeChangeDetail { start: number; end: number; renderedStart: number; renderedEnd: number }
interface WindowRange { readonly start: number; readonly end: number }
```

## 33. Vanilla JS example

```ts
import { VirtualList } from '@absoluteui/components/virtual-list';
import '@absoluteui/components/virtual-list/style.css';

const host = document.querySelector<HTMLElement>('#countries');
if (host) VirtualList.create<string>(host, { label: 'Countries', items: ['Austria', 'Belgium', 'Chile'], selection: 'single', renderItem: (name) => document.createTextNode(name) });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiVirtualList } from '@absoluteui/angular/virtual-list';

interface Person { id: string; name: string }

@Component({
  selector: 'app-people',
  imports: [AuiVirtualList],
  template: `<aui-virtual-list label="People" selection="single" [items]="people" [itemKey]="key" [renderItem]="render"></aui-virtual-list>`,
})
export class PeopleComponent {
  readonly people: Person[] = Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), name: `Person ${String(i + 1)}` }));
  readonly key = (p: Person): string => p.id;
  readonly render = (p: Person): Node => document.createTextNode(p.name);
}
```

## 35. React example

```tsx
import { AuiVirtualList } from '@absoluteui/react/virtual-list';

const items = Array.from({ length: 10_000 }, (_, i) => `Item ${String(i + 1)}`);

export function Example() {
  return <AuiVirtualList label="Items" items={items} renderItem={(item: string) => document.createTextNode(item)} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiVirtualList } from '@absoluteui/vue/virtual-list';

const items = Array.from({ length: 10_000 }, (_, i) => `Item ${String(i + 1)}`);
const render = (item: string): Node => document.createTextNode(item);
</script>

<template>
  <AuiVirtualList label="Items" :items="items" :render-item="render" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
