# Menu Bar

> Package: `@absoluteui/components/menu-bar` | Styles: `@absoluteui/components/menu-bar/style.css` and `@absoluteui/components/menu/style.css` (the menus are Menu popups) | Since 0.3.0 | Status: R2

## 1. Purpose

A horizontal application menubar following the WAI-ARIA APG Menubar pattern. The bar is a `role="menubar"` row of `role="menuitem"` buttons with a single tab stop (roving tabindex). Items with `items` open a Menu, which is the same component and engine as Menu, so submenus, checkbox and radio items, typeahead, and the overlay stack behave identically. Items without `items` are commands: they open nothing and emit `aui-select`. While a menu is open, ArrowLeft/ArrowRight (mirrored in RTL) and pointer hover move to the neighbouring menu.

## 2. Anatomy

```text
<div class="aui-menu-bar">                                        (consumer host; children replaced)
  <div class="aui-menu-bar__bar" role="menubar" aria-label="Editor">
    <div class="aui-menu-bar__entry" role="none">                 (display: contents)
      <button class="aui-menu-bar__item" role="menuitem" tabindex="0" data-id="file"
              aria-haspopup="menu" aria-expanded="false" aria-controls=menu>
        <svg class="aui-menu-bar__icon">                          (optional)
        <span class="aui-menu-bar__label">File</span>
      </button>
      <div class="aui-menu" role="menu" popover="manual" aria-labelledby=button>   (Menu popup, top layer)
      <div class="aui-menu aui-menu--submenu" role="menu">        (one per submenu)
    </div>
    <div class="aui-menu-bar__entry" role="none">
      <button class="aui-menu-bar__item" role="menuitem" tabindex="-1" data-id="help">Help</button>   (command)
    </div>
  </div>
</div>
```

## 3. When to use

- A persistent application command bar in the style of desktop software (File, Edit, View, Help) in editors and tools.
- Several groups of commands that each need their own menu.

## 4. When not to use

- Site or app navigation made of links: use navigation links or Tabs, not `role="menubar"`.
- A single overflow or row-actions menu: use Menu.
- A row of always-visible buttons without menus: use a toolbar or Button Group.
- Vertical side navigation: the menu bar is horizontal only.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The host (class `aui-menu-bar`). Its children are replaced on create. |
| `element` | `HTMLDivElement` | The `role="menubar"` element. |
| `options` | `Readonly<MenuBarOptions>` | Current options. |

Options: `label` (required, non-empty), `items` (required, non-empty `MenuBarItem[]`), `icons`, `renderItem` (items of the menus, not the menubar buttons), plus the global options below. Full table: `metadata/menu-bar/api.json`. `renderItem(item, { doc })` (since 0.9.0) returns custom item content: the item `label` stays the accessible name and typeahead text (visually hidden), the node is decorative (`aria-hidden`), nodes are reused per item object and released with `releaseNode` when the item is dropped or the menu is destroyed.

| Global option | Type | Default |
|---|---|---|
| `closeOnSelect` | `boolean` | `true` |
| `typeahead` | `boolean` | `true` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

`MenuBarItem` is `{ id, label, icon?, disabled?, items? }`. `items` uses the Menu item model (`MenuItem`: action, checkbox, radio, separator, group, nested submenus).

## 6. Methods

| Method | Description |
|---|---|
| `MenuBar.create(host, options)` | Render into an empty host. Throws on invalid options before touching the host. |
| `menu(id)` | The `Menu` opened by the bar item `id`, or `null` for commands, disabled items, and unknown ids. Use it for `aui-open`/`aui-close` or `open()`. |
| `close()` | Close any open menu. Focus returns to its bar item when it was inside the menu. |
| `update(options)` | Merge and validate. New `items`, `icons`, or `renderItem` rebuild the bar and its menus (focus and the tab stop stay on the item with the same id; open menus close and checkbox/radio state resets). Other options update the existing menus in place: an open menu stays open and checkbox/radio state is kept. A failed update keeps the previous options. |
| `destroy()` | Destroy every menu, remove listeners and the configuration subscription, empty the host, and remove the `aui-menu-bar` class. |

## 7. Events

| Event | Target | Detail | Bubbles | Description |
|---|---|---|---|---|
| `aui-select` | `host` | `{ id, item, checked? }` | Yes | A command bar item was activated (`item` is the `MenuBarItem`), or an enabled menu item was activated (`item` is the menu item, `checked` the new state for checkbox and radio items). Menu selections are re-dispatched on the host, so every selection has the host as its target. |

Each menu also dispatches `aui-open` and `aui-close` (detail `null`, non-bubbling) on `menu(id).element`. Disabled items, submenu parents, and programmatic calls never emit `aui-select`.

## 8. Slots/content areas

None. Bar items and menu items are data; labels are text.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-menu-bar` | Host. |
| `aui-menu-bar--rtl` | Effective direction is RTL. |
| `aui-menu-bar__bar` | The menubar row (wrapping flex). |
| `aui-menu-bar__entry` | `role="none"` wrapper, `display: contents`; contains the item and its menu popups. |
| `aui-menu-bar__item` | Bar item button; `[aria-expanded='true']` while its menu is open, `[aria-disabled='true']` when disabled, `[data-id]` holds the item id. |
| `aui-menu-bar__icon`, `aui-menu-bar__label` | Item parts. |
| `aui-menu`, `aui-menu__*` | Menu popups; see [Menu](menu.md). |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/menu-bar/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `radius-md`, `radius-sm`, `color-hover`, `color-text-disabled`, `color-focus-ring`, `control-height-sm`. Menus use the Menu tokens.

## 11. States

idle, bar item focused (`:focus-visible` adds the ring), menu open (bar item `aria-expanded="true"` keeps the hover background), submenu open, bar item disabled.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| idle | Tab into the bar | the tab-stop item focused |
| item focused | ArrowLeft/ArrowRight, Home/End, typeahead | another bar item focused; tab stop moves with it |
| item with a menu focused | click, Enter, Space, ArrowDown / ArrowUp | menu open; first / last enabled item focused; `aui-open` on the menu |
| command item focused | click, Enter, Space | `aui-select`; focus stays |
| menu open | unhandled ArrowLeft/ArrowRight | menu closed; neighbouring bar item focused and its menu opened (commands are only focused) |
| menu open | pointer moves over another bar item | same as above |
| menu open | activate an action item | menu closed; focus on the bar item; `aui-select` |
| menu open | Escape at the top level | menu closed; focus on the bar item |
| menu open | Tab, outside press, focus moving elsewhere, `close()` | menu closed |
| any | `update({ items })` or `update({ icons })` | rebuilt; open menus closed |
| any | other `update()`, global `menuBar` configuration change | applied in place; an open menu stays open |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Page | Enter or leave the bar (one tab stop: the last focused item, else the first enabled item). |
| ArrowRight / ArrowLeft (mirrored in RTL) | Bar item | Next / previous bar item, wrapping. Disabled items receive focus. |
| Home / End | Bar item | First / last bar item. |
| Printable characters | Bar item, `typeahead: true` | Next enabled bar item whose label starts with the typed text. |
| ArrowDown / Enter / Space | Bar item with a menu | Open and focus the first enabled menu item. |
| ArrowUp | Bar item with a menu | Open and focus the last enabled menu item. |
| Enter / Space | Command bar item | Emit `aui-select`. |
| ArrowDown / ArrowUp / Home / End / typeahead | Menu | Menu navigation, as in Menu. |
| ArrowRight (RTL: ArrowLeft) | Submenu parent | Open the submenu. |
| ArrowLeft (RTL: ArrowRight) | Submenu | Close it and focus the parent item. |
| ArrowRight / ArrowLeft (mirrored in RTL) | Menu, key not handled by the menu | Move to the neighbouring bar item (wrapping) and open its menu. |
| Enter / Space | Menu item | Activate, as in Menu. Action items close the menu and focus the bar item. |
| Escape | Top-level menu | Close and focus the bar item. Submenus close one level at a time. |
| Tab / Shift+Tab | Menu | Close all levels and move on out of the bar. |

Keys with Alt, Ctrl, or Meta are not handled by the bar.

## 14. ARIA contract

- Bar: `role="menubar"`, `aria-label` from the `label` option. Horizontal (the implicit orientation).
- Wrappers: `role="none"`. Bar items: `role="menuitem"` on native `<button>` elements, roving `tabindex` (`0` on the current item, `-1` on the others).
- Items with a menu: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` (set by Menu). Disabled items with `items`: `aria-haspopup="menu"` and `aria-expanded="false"` (no menu is created).
- Disabled items: `aria-disabled="true"`; focusable, never activated.
- Menus: the Menu contract (`role="menu"`, labelled by the bar item through `aria-labelledby`; see [Menu](menu.md)).
- Icons are `aria-hidden`.

## 15. Accessibility notes

- One tab stop keeps the bar cheap to pass for keyboard users; the tab stop remembers the last focused item.
- Disabled items stay focusable (APG) so users can discover them.
- Hover switching follows real pointer movement only; touch never switches menus.
- Focus returns to the bar item on activation, Escape, and Tab from a menu.
- `update()` or a global configuration change while a menu is open closes it without restoring focus (see Known limitations).
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The bar is a wrapping flex row: on narrow widths items wrap onto further lines and labels wrap anywhere. There is no overflow ("more") collapse. Menus size and position like Menu popups and flip and shift to stay in the viewport.

## 17. RTL behavior

The effective direction is RTL when `direction` (or the global direction) is `'rtl'` or the host inherits `dir="rtl"`. Then ArrowLeft moves to the next bar item, menu switching is mirrored, menus open `bottom-start` aligned to the item's right edge, submenus open to the left, and the host gets `aui-menu-bar--rtl`. Layout uses logical properties.

## 18. Theme behavior

Colors come from role tokens only. In forced-colors mode the bar has a `CanvasText` border, the expanded item is drawn in `Highlight` / `HighlightText`, and disabled items in `GrayText`. Menus follow the Menu theme.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { menuBar: { closeOnSelect: false, typeahead: false } } });
```

A change applies to existing bars in place (open menus stay open). The global `menu` configuration does not apply to menubar menus: the bar passes `placement: 'bottom-start'`, `closeOnSelect`, `typeahead`, and `direction` explicitly.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic through `update()`; only `items` and `icons` rebuild the bar.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.submenu` (default `chevron-right`), `icons.checked` (default `check`), and `icons.radio` (default `check`), passed to every menu. Bar items and menu items take a per-item `icon`.

## 23. Security behavior

All text uses `textContent`; nothing is parsed as HTML. Positioning writes styles through the CSSOM. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Menu checkbox and radio state is kept in memory and reset when the bar is rebuilt (`update({ items })` or `update({ icons })`).

## 25. Performance characteristics

All menus are built on create and when `items` or `icons` change. Four delegated listeners on the bar, the listeners of each Menu, and one configuration subscription. Budget: under 50 ms for `MenuBar.create` with 8 menus of 20 items.

## 26. Supported data scale

Tested with 8 bar items of 20 menu items each and submenus two levels deep. Keep the bar short enough to fit on one line at common widths.

## 27. Usage examples

```ts
import { MenuBar } from '@absoluteui/components/menu-bar';

const host = document.querySelector<HTMLElement>('#app-menu');
if (host) {
  MenuBar.create(host, {
    label: 'Editor',
    items: [
      { id: 'file', label: 'File', items: [{ id: 'new', label: 'New' }, { id: 'save', label: 'Save' }] },
      { id: 'edit', label: 'Edit', items: [{ id: 'undo', label: 'Undo' }] },
      { id: 'help', label: 'Help' },
    ],
  });
}
```

More examples, type-checked in CI: `metadata/menu-bar/examples.json`.

## 28. Edge cases

- Ids must be unique across the bar and all menus; a bar item and a menu item with the same id throw `MENU_BAR_OPTIONS`.
- A bar item with `items: []` throws; omit `items` for a command.
- A disabled item with `items` gets no Menu: `menu(id)` returns `null`, and it cannot be opened.
- ArrowRight on a leaf item inside a submenu moves to the next bar item (the menu does not handle it).
- Moving to a command item while a menu is open closes the menu and focuses the command; nothing opens.
- `update({ items })` keeps focus and the tab stop on the same id when it still exists; otherwise the tab stop moves to the first enabled item.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `MENU_BAR_OPTIONS` | configuration | Empty or non-string `label`; `items` not a non-empty array; an item that is not an object; missing or empty id or label; duplicate id across the bar and menus; empty `items` on a bar item or submenu; invalid menu items (as in Menu). |
| `CFG_INVALID_VALUE` | configuration | Invalid `closeOnSelect`, `typeahead`, or `direction`. |

A failed construction leaves the host untouched: no rendering, class, listeners, or subscriptions. A failed `update()` keeps the previous options.

## 30. Known limitations

- Horizontal only; no overflow collapse (items wrap).
- `update({ items })` and `update({ icons })` rebuild every menu: an open menu closes, focus inside it is not restored, and checkbox/radio state resets.
- An explicit `direction: 'ltr'` does not override an inherited `dir="rtl"`. Menus read the direction at render time, so a later `dir` change reaches them only on the next render.
- Menu placement is fixed at `bottom-start`.
- Submenus inherit the Menu limitations (150 ms hover delay without a pointer-safe triangle; shortcut text is a hint only).
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Vertical menubars.
- Link items (`href`); navigate in the `aui-select` listener.
- HTML or custom nodes inside items.
- Checkbox or radio items directly on the bar.

## 32. TypeScript definitions

```ts
interface MenuBarItem { id: string; label: string; icon?: IconRef; disabled?: boolean; items?: readonly MenuItem[] }
interface MenuBarConfig { closeOnSelect: boolean; typeahead: boolean }
interface MenuBarOptions extends Partial<MenuBarConfig> {
  label: string;
  items: readonly MenuBarItem[];
  direction?: 'ltr' | 'rtl';
  icons?: Partial<MenuIcons>;
}
type MenuBarSelectDetail = MenuSelectDetail; // { id: string; item: MenuSelectableItem; checked?: boolean }
```

`MenuItem`, `MenuSelectableItem`, `MenuSelectDetail`, and `MenuIcons` are re-exported from `@absoluteui/components/menu-bar`. For a command bar item, `detail.item` is the `MenuBarItem` object.

## 33. Vanilla JS example

```ts
import { MenuBar, type MenuBarSelectDetail } from '@absoluteui/components/menu-bar';
import '@absoluteui/components/menu/style.css';
import '@absoluteui/components/menu-bar/style.css';

const host = document.querySelector<HTMLElement>('#app-menu');
if (host) {
  const bar = MenuBar.create(host, {
    label: 'Editor',
    items: [
      { id: 'file', label: 'File', items: [
        { id: 'new', label: 'New', shortcut: 'Ctrl+N' },
        { id: 'open-recent', label: 'Open recent', items: [{ id: 'recent-report', label: 'report.md' }] },
      ] },
      { id: 'view', label: 'View', items: [{ type: 'checkbox', id: 'grid', label: 'Show grid', checked: true }] },
      { id: 'help', label: 'Help' },
    ],
  });
  host.addEventListener('aui-select', (event) => {
    const { id, checked } = (event as CustomEvent<MenuBarSelectDetail>).detail;
    if (id === 'help') bar.close();
    if (checked !== undefined) host.dataset[id] = String(checked);
  });
}
```

## 34. Angular example

The generated `AuiMenuBar` directive goes on an empty host; its inputs mirror the options and `auiSelect` carries the event detail.

```ts
import { Component } from '@angular/core';
import type { MenuBarItem, MenuBarSelectDetail } from '@absoluteui/components/menu-bar';
import { AuiMenuBar } from '@absoluteui/angular/menu-bar';

@Component({
  selector: 'app-editor-menu',
  imports: [AuiMenuBar],
  template: `<aui-menu-bar label="Editor" [items]="items" (selected)="onSelect($event)"></aui-menu-bar>`,
})
export class EditorMenuComponent {
  readonly items: MenuBarItem[] = [
    { id: 'file', label: 'File', items: [{ id: 'new', label: 'New' }, { id: 'save', label: 'Save' }] },
    { id: 'help', label: 'Help' },
  ];

  onSelect(detail: MenuBarSelectDetail): void {
    if (detail.id === 'save') {
      // save the document
    }
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
