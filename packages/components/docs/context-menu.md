# Context Menu

> Package: `@absoluteui/components/context-menu` | Styles: `@absoluteui/components/context-menu/style.css` and `@absoluteui/components/menu/style.css` (the popup is a Menu popup) | Since 0.3.0 | Status: R2

## 1. Purpose

A Menu opened as a context menu: on the `contextmenu` event at the pointer position, or from the keyboard with Shift+F10 or the ContextMenu key at the focused element inside the target. It reuses the Menu engine (WAI-ARIA APG Menu), so submenus, checkbox and radio items, typeahead, and the overlay stack behave exactly as in Menu. The browser's native menu stays reachable: Shift+right-click is left to the browser by default (`nativeModifier: 'shift'`), and `disabled` keeps the native menu entirely.

## 2. Anatomy

```text
<div id="files">                                         (consumer target; no attributes added)
  <li data-file="a.txt">...</li>                         (right-clicked or focused element = origin)
</div>
...
<div class="aui-menu aui-menu--context" role="menu" popover="manual" aria-label="Context menu">   (end of the target's <dialog>, or <body>)
  <div class="aui-menu__item" role="menuitem" tabindex="-1">...</div>                            (Menu items, roving tabindex; see Menu)
</div>
<div class="aui-menu aui-menu--submenu" role="menu" popover="manual">                            (one per submenu)
```

## 3. When to use

- Shortcuts to commands for the object under the pointer (rows, files, canvas objects) that are also available elsewhere.
- Per-row commands in a list or table: one instance on the container, with `origin` in the `aui-select` detail identifying the row.

## 4. When not to use

- As the only way to reach an action: context menus are hard to discover and unavailable on many touch devices. Always provide a visible control too (for example a Menu button per row).
- On text content where users expect the native menu (copy, paste, spell check, "open link in new tab").
- Choosing a form value: use Select, Combobox, or Radio Group.
- Rich interactive content: use Popover or Dialog.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `target` | `HTMLElement` | The element whose content opens the menu. It receives no ARIA attributes. |
| `element` | `HTMLDivElement` | Top-level `role="menu"` popup (`aui-menu aui-menu--context`). Lifecycle events are dispatched here. |
| `isOpen` | `boolean` | Whether the menu is open. |
| `origin` | `Element \| null` | Element the open (or last opened) menu belongs to: the right-clicked element, the focused element, or `target` for `open()`. `null` before the first open and after `destroy()`. |
| `options` | `Readonly<ContextMenuOptions>` | Current options. |

Options: `items` (required), `label` (default localized "Context menu"), `disabled`, `icons`, `renderItem`, plus the global options below. `renderItem(item, { doc })` (since 0.9.0) returns custom item content: the item `label` stays the accessible name and typeahead text (visually hidden), the node is decorative (`aria-hidden`), nodes are reused per item object and released with `releaseNode` when the item is dropped or the menu is destroyed. Full table: `metadata/context-menu/api.json`.

| Global option | Type | Default |
|---|---|---|
| `closeOnSelect` | `boolean` | `true` |
| `typeahead` | `boolean` | `true` |
| `nativeModifier` | `'shift' \| 'none'` | `'shift'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `ContextMenu.create(target, options)` | Attach to a connected element. Throws on an invalid target or options before anything is attached. |
| `open(point?)` | Open at viewport (client) coordinates `{ x, y }`, or below the target when no point is given. Focus moves to the first enabled item; `origin` becomes the target. Works while `disabled`. |
| `close()` | Close all levels. Focus is restored only when it was inside the menu. |
| `update(options)` | Merge, validate, and apply options. New `items` reset checkbox and radio state and close open submenus; `disabled: true` closes an open menu. A failed update keeps the previous options. |
| `destroy()` | Close, then remove all popups, listeners, and the configuration subscription. The target gets the native menu back. |

## 7. Events

| Event | Target | Detail | Bubbles | Description |
|---|---|---|---|---|
| `aui-select` | `target` | `{ id, item, checked?, origin }` | Yes | The user activated an enabled item. `origin` is the element the menu was opened for; `checked` is the new state for checkbox and radio items. |
| `aui-open` | `element` | `null` | No | The top level opened. |
| `aui-close` | `element` | `null` | No | All levels closed. |

Submenu parents and disabled items never emit `aui-select`. Programmatic calls emit only the lifecycle events. Reopening while open (a second right-click) emits `aui-close` then `aui-open`.

## 8. Slots/content areas

None. Items are data; labels, descriptions, shortcuts, and group labels are text.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-menu--context` | Top-level popup of a context menu; minimum inline size 12rem. |
| `aui-menu`, `aui-menu__*` | Menu popup and item parts; see [Menu](menu.md). |
| `[data-direction='rtl']`, `[data-placement]` | As in Menu. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

The context-menu stylesheet uses no tokens (`metadata/context-menu/tokens.json` is empty, verified in CI). All colors, spacing, and typography come from the Menu stylesheet and its tokens.

## 11. States

closed, open at the pointer, open at an element (keyboard or `open()` without a point), submenu open, disabled (native menu kept), item focused, item disabled, item checked.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | right-click inside the target (not Shift with `nativeModifier: 'shift'`, not `disabled`) | open at the pointer; native menu suppressed; first enabled item focused; `aui-open` |
| closed | Shift+F10 or ContextMenu key with focus inside the target (not `disabled`) | open below the focused element |
| closed | `open(point?)` | open at the point, or below the target |
| open | right-click inside the target again | closed and reopened at the new point and origin |
| open | activate an action item | closed; focus restored; `aui-close`, then `aui-select` |
| open | activate a checkbox/radio item | state toggled; closed only when `closeOnSelect` is true |
| open | Escape at the top level | closed; focus restored |
| open | Tab, outside press, focus moving elsewhere, `close()`, `update({ disabled: true })` | closed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Shift+F10 / ContextMenu | Focus inside the target | Open below the focused element and focus the first enabled item. |
| ArrowDown / ArrowUp | Menu | Next / previous item, wrapping. Disabled items receive focus. |
| Home / End | Menu | First / last item. |
| Printable characters | Menu, `typeahead: true` | Focus the next item whose label starts with the typed text. |
| Enter | Item | Activate; toggle checkbox; check radio; open a submenu and focus its first item. |
| Space | Item | Same as Enter. With `closeOnSelect: false`, toggles checkbox/radio items without closing. |
| ArrowRight (RTL: ArrowLeft) | Submenu parent | Open the submenu and focus its first item. |
| ArrowLeft (RTL: ArrowRight) | Submenu | Close it and focus the parent item. |
| Escape | Submenu | Close that level only. |
| Escape | Top level | Close and restore focus. An enclosing Dialog stays open. |
| Tab / Shift+Tab | Menu | Close all levels, restore focus, and move on from there. |

Shift+F10 and the ContextMenu key with Ctrl, Alt, or Meta are not handled.

## 14. ARIA contract

- Target: unchanged. No `role`, `aria-haspopup`, or `aria-expanded` is added (a context menu has no trigger button).
- Menu: `role="menu"` with `aria-label` from `label` (default localized "Context menu").
- Items, checkable items, submenus, groups, separators, and icons: the Menu contract (see [Menu](menu.md)).

## 15. Accessibility notes

- Nothing announces that a context menu exists. Add a visible hint or a description, for example `aria-describedby` text "Press Shift+F10 for actions", on the target or its rows.
- Never put actions only in a context menu; offer each one through a visible control as well.
- For per-row keyboard use, rows (or controls in them) must be focusable: the keyboard opens the menu at the focused element.
- Focus is restored to the element focused before opening (not `<body>`), else to the target when it is focusable.
- Inside a modal Dialog the popup is appended to the dialog, so it is not inert; Escape closes the menu before the dialog.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The popup is at least 12rem wide (Menu maximum `min(22rem, 100vw - 1rem)`). Its height is capped by `popover-max-height` and the space available in the viewport, then it scrolls. The positioning engine flips and shifts every level to keep it on screen. At the pointer, the menu's corner sits 1px from the pointer so the first item is not under it; the anchor moves with the target when the page scrolls.

## 17. RTL behavior

With `direction: 'rtl'` (option or global direction), `bottom-start` alignment is mirrored, submenus open to the left, ArrowLeft opens a submenu and ArrowRight closes it, and the chevron is mirrored through `[data-direction='rtl']`. An inherited `dir="rtl"` alone does not switch the menu; set `direction`.

## 18. Theme behavior

Identical to Menu: role tokens only, verified in the light, dark, and high-contrast themes; forced-colors mode draws the focused item in `Highlight` / `HighlightText` and disabled items in `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { contextMenu: { nativeModifier: 'none', closeOnSelect: false } } });
```

Changes apply to existing instances: `direction` updates immediately and an open menu is repositioned; `nativeModifier`, `closeOnSelect`, and `typeahead` apply to the next interaction. The global `menu` configuration does not apply.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.submenu` (default `chevron-right`), `icons.checked` (default `check`), and `icons.radio` (default `check`). Item icons are set per item with `icon`.

## 23. Security behavior

All text uses `textContent`; nothing is parsed as HTML. Positioning writes styles through the CSSOM. CSP-safe. The native menu is suppressed only for right-clicks the component handles and inside its own popup.

## 24. Data handling behavior

No persistence, network access, or telemetry. Checkbox and radio state is kept in memory and reset by `update({ items })`.

## 25. Performance characteristics

All levels are built once per `items` change, detached, then appended. Two listeners on the target, one on the document, the Menu engine's delegated listeners per level, and one configuration subscription. Budget: under 100 ms for `ContextMenu.create` plus `open()` with 200 items.

## 26. Supported data scale

Tested with 200 items in one level and three nested levels. Use one instance per container (not per row) and identify the row from `origin`.

## 27. Usage examples

```ts
import { ContextMenu, type ContextMenuSelectDetail } from '@absoluteui/components/context-menu';

const list = document.querySelector<HTMLElement>('#files');
if (list) {
  ContextMenu.create(list, { items: [{ id: 'rename', label: 'Rename' }, { id: 'delete', label: 'Delete', tone: 'danger' }] });
  list.addEventListener('aui-select', (event) => {
    const { id, origin } = (event as CustomEvent<ContextMenuSelectDetail>).detail;
    const row = origin.closest<HTMLElement>('[data-file]');
    if (row) row.dataset.lastAction = id;
  });
}
```

To vary items per origin, call `update({ items })` from a capture-phase `contextmenu` (and `keydown`) listener on the target: it runs before the component's own listener. More examples, type-checked in CI: `metadata/context-menu/examples.json`.

## 28. Edge cases

- An empty `items` array is allowed; the menu opens with focus on the menu container.
- Duplicate ids anywhere in the tree throw `CONTEXT_MENU_OPTIONS`.
- Shift+right-click with `nativeModifier: 'shift'` is not handled at all (no `preventDefault()`), so the browser shows its native menu.
- Right-clicking inside the open popup never shows the native menu.
- A keyboard-generated `contextmenu` event (no pointer position) opens at the focused element inside the target, or below the target.
- When the target is `<body>` the popup is inside the target; right-clicks inside the popup are ignored by the target handler.
- `open()` while open closes and reopens at the new point.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CONTEXT_MENU_TARGET` | configuration | The target is not a connected `HTMLElement` (elements from another realm fail the `instanceof` check). |
| `CONTEXT_MENU_OPTIONS` | configuration | `items` not an array, missing or empty label or id, duplicate id, empty submenu, missing radio group, non-boolean `checked`; empty `label`; non-boolean `disabled`; `open()` with non-finite coordinates. |
| `CFG_INVALID_VALUE` | configuration | Invalid `closeOnSelect`, `typeahead`, `nativeModifier`, or `direction`. |

A failed construction leaves no popups, listeners, or subscriptions behind. A failed `update()` keeps the previous options.

## 30. Known limitations

- The target gets no ARIA attributes; discoverability is the consumer's job (hint or description).
- `nativeModifier` applies to pointer right-clicks only. Inside an enabled target, Shift+F10 and the ContextMenu key always open the component menu, so the native menu is not reachable from the keyboard there.
- One item list per instance; vary it with `update({ items })`.
- The pointer anchor is fixed relative to the target's box: scrolling content inside a scrollable target does not move the menu.
- Keyboard-generated `contextmenu` events are recognized heuristically (not button 2, at client point 0,0).
- Popups are placed in the target's enclosing `<dialog>` or `<body>` at construction; moving the target between them needs `destroy()` and `create()`.
- The Menu limitations apply (150 ms submenu hover delay without a pointer-safe triangle; shortcut text is a hint only).
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Opening on touch long-press, except where the browser itself fires `contextmenu`.
- HTML or custom nodes inside items.
- Link items (`href`); navigate in the `aui-select` listener.

## 32. TypeScript definitions

```ts
type ContextMenuNativeModifier = 'shift' | 'none';
interface ContextMenuConfig { closeOnSelect: boolean; typeahead: boolean; nativeModifier: ContextMenuNativeModifier }
interface ContextMenuOptions extends Partial<ContextMenuConfig> {
  items: readonly MenuItem[];
  label?: string;
  disabled?: boolean;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<MenuIcons>;
}
interface ContextMenuSelectDetail extends MenuSelectDetail { origin: Element }
```

`MenuItem`, `MenuSelectableItem`, `MenuSelectDetail`, and `MenuIcons` are re-exported from `@absoluteui/components/context-menu`.

## 33. Vanilla JS example

```ts
import { ContextMenu, type ContextMenuSelectDetail } from '@absoluteui/components/context-menu';
import '@absoluteui/components/menu/style.css';
import '@absoluteui/components/context-menu/style.css';

const table = document.querySelector<HTMLTableElement>('#orders');
if (table) {
  const menu = ContextMenu.create(table, {
    label: 'Order actions',
    items: [
      { id: 'open', label: 'Open' },
      { id: 'copy-id', label: 'Copy order id', shortcut: 'Ctrl+C' },
      { type: 'separator' },
      { id: 'cancel', label: 'Cancel order', tone: 'danger' },
    ],
  });
  table.addEventListener('aui-select', (event) => {
    const { id, origin } = (event as CustomEvent<ContextMenuSelectDetail>).detail;
    const row = origin.closest<HTMLTableRowElement>('tr[data-order]');
    if (row) row.dataset.lastAction = id;
  });
  menu.element.addEventListener('aui-close', () => {
    table.dataset.menu = 'closed';
  });
}
```

## 34. Angular example

`AuiContextMenu` goes on the target; `[auiContextMenu]` binds the items, `contextMenuLabel` the accessible name, and `contextMenuDisabled` the `disabled` option. The directive also has `open(point?)` and `close()`.

```ts
import { Component } from '@angular/core';
import type { ContextMenuSelectDetail, MenuItem } from '@absoluteui/components/context-menu';
import { AuiContextMenu } from '@absoluteui/angular/context-menu';

@Component({
  selector: 'app-file-list',
  imports: [AuiContextMenu],
  template: `
    <p id="files-hint">Right-click a file or press Shift+F10 for actions.</p>
    <ul aria-describedby="files-hint" [auiContextMenu]="items" contextMenuLabel="File actions" (selected)="onSelect($event)">
      @for (file of files; track file) {
        <li tabindex="0" [attr.data-file]="file">{{ file }}</li>
      }
    </ul>
  `,
})
export class FileListComponent {
  readonly files = ['report.md', 'notes.txt'];
  readonly items: MenuItem[] = [
    { id: 'rename', label: 'Rename' },
    { id: 'delete', label: 'Delete', tone: 'danger' },
  ];

  onSelect(detail: ContextMenuSelectDetail): void {
    const file = detail.origin.closest('[data-file]')?.getAttribute('data-file');
    if (detail.id === 'delete' && file) {
      // confirm and delete the file
    }
  }
}
```

The directive also emits `auiOpen` and `auiClose`.

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
