# Menu

> Package: `@absoluteui/components/menu` | Styles: `@absoluteui/components/menu/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

An actions menu opened from a trigger button, following the WAI-ARIA APG Menu Button and Menu patterns. `Menu` supports icons, descriptions, shortcut hints, a danger tone, checkbox and radio items, labelled groups, separators, and nested submenus. Each level renders in the top layer through the Popover API and takes part in the shared overlay stack, so Escape and outside presses close only the topmost level, including inside a Dialog.

## 2. Anatomy

```text
<button aria-haspopup="menu" aria-expanded aria-controls=menu>Actions</button>   (consumer trigger)
<div class="aui-menu" role="menu" popover="manual" aria-labelledby=trigger>         (inserted after the trigger)
  <div class="aui-menu__item" role="menuitem" tabindex="-1" aria-labelledby aria-describedby>   (tabindex="0" while focused)
    <span class="aui-menu__check">                (reserved when the level has checkable items)
    <span class="aui-menu__icon">                 (optional)
    <span class="aui-menu__text">
      <span class="aui-menu__label">
      <span class="aui-menu__description">        (optional)
    <span class="aui-menu__shortcut">             (optional)
    <svg class="aui-menu__submenu-icon">          (submenu parents)
  <div class="aui-menu__separator" role="separator">
  <div class="aui-menu__group" role="group" aria-labelledby=label>
    <div class="aui-menu__group-label">
    <div class="aui-menu__item" role="menuitemcheckbox | menuitemradio" aria-checked>
</div>
<div class="aui-menu aui-menu--submenu" role="menu" popover="manual" aria-labelledby=parent-label>   (one per submenu)
```

## 3. When to use

- Commands attached to a button: row actions, overflow "more" menus, editor commands.
- A few view toggles (checkbox items) or a choice among modes (radio items) inside an actions menu.
- Secondary actions grouped into submenus to keep the first level short.

## 4. When not to use

- Choosing a form value: use Select, Combobox, or Radio Group.
- Site or app navigation made of links: use navigation links or a disclosure, not `role="menu"`.
- A persistent horizontal command bar: use a toolbar.
- Rich interactive content such as text fields: use a popover or Dialog.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `trigger` | `HTMLButtonElement` | The menu button. |
| `element` | `HTMLDivElement` | Top-level `role="menu"` popup, inserted after the trigger. |
| `isOpen` | `boolean` | Whether the top-level menu is open. |

Options: `items` (required), `label`, `icons`, `renderItem`, plus the global options below. `renderItem(item, { doc })` (since 0.9.0) returns custom item content: the item `label` stays the accessible name and typeahead text (visually hidden), the node is decorative (`aria-hidden`), nodes are reused per item object and released with `releaseNode` when the item is dropped or the menu is destroyed. Full table: `metadata/menu/api.json`.

| Global option | Type | Default |
|---|---|---|
| `placement` | `Placement` | `'bottom-start'` |
| `closeOnSelect` | `boolean` | `true` |
| `typeahead` | `boolean` | `true` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Menu.create(trigger, options)` | Attach a menu to a `<button>` that has a parent node. Throws on invalid options before rendering. |
| `open(focus?)` | Open and focus the first (`'first'`, default) or last (`'last'`) enabled item. |
| `close()` | Close all levels. Focus returns to the trigger when it was inside the menu. |
| `update(options)` | Merge and apply options. New `items` reset checkbox and radio state and close open submenus. |
| `destroy()` | Close, then remove all popups, trigger attributes, listeners, and subscriptions. |

## 7. Events

| Event | Target | Detail | Bubbles | Description |
|---|---|---|---|---|
| `aui-select` | trigger | `{ id, item, checked? }` | Yes | The user activated an enabled item. `checked` is the new state for checkbox and radio items. |
| `aui-open` | `element` | `null` | No | The top level opened. |
| `aui-close` | `element` | `null` | No | All levels closed. |

Submenu parents and disabled items never emit `aui-select`. Programmatic calls (`open`, `close`, `update`) emit only the lifecycle events.

## 8. Slots/content areas

None. Items are data; labels, descriptions, shortcuts, and group labels are text.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-menu` | Menu popup (top level and submenus). |
| `aui-menu--submenu` | Submenu popup. |
| `aui-menu--has-check` | The level has checkbox/radio items; reserves the check column. |
| `aui-menu__item`, `aui-menu__item--danger` | Item and destructive tone. |
| `aui-menu__check`, `__icon`, `__text`, `__label`, `__description`, `__shortcut`, `__submenu-icon` | Item parts. |
| `aui-menu__separator` | Separator. |
| `aui-menu__group`, `__group-label` | Group and its visible label. |
| `[data-direction='rtl']` | Set on every level; mirrors the submenu chevron. |
| `[data-placement]` | Final placement written by the positioning engine. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/menu/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `shadow-md`, `radius-md`, `color-hover`, `color-focus-ring`, `color-text-muted`, `color-error-fg`, `popover-max-height`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-menu-radius` (menu corner radius; falls back to `radius-md`), `--aui-menu-bg` (menu background; falls back to `color-surface`), `--aui-menu-shadow` (menu elevation; falls back to `shadow-md`), `--aui-menu-item-radius` (menu item corner radius; falls back to `radius-sm`), `--aui-menu-item-height` (menu item height; falls back to `control-height-sm`).

## 11. States

closed, open, submenu open (parent item keeps the hover background), item focused (`:focus-visible` adds the ring), item disabled, item checked, danger item.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | trigger click, Enter, Space, ArrowDown / ArrowUp, `open()` | open; first / last enabled item focused; `aui-open` |
| open | ArrowRight (RTL: ArrowLeft), Enter, or click on a submenu parent; hover for 150 ms | submenu open |
| submenu open | ArrowLeft (RTL: ArrowRight), Escape | submenu closed; focus on its parent item |
| open | activate an action item | closed; focus on the trigger; `aui-close`, then `aui-select` |
| open | activate a checkbox/radio item | state toggled; closed only when `closeOnSelect` is true |
| open | Escape at the top level | closed; focus on the trigger |
| open | Tab, trigger click, outside press, focus moving elsewhere, `close()` | closed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space / ArrowDown | Trigger | Open and focus the first enabled item. |
| ArrowUp | Trigger | Open and focus the last enabled item. |
| ArrowDown / ArrowUp | Menu | Next / previous item, wrapping. Disabled items receive focus. |
| Home / End | Menu | First / last item. |
| Printable characters | Menu, `typeahead: true` | Focus the next item whose label starts with the typed text. |
| Enter | Item | Activate; toggle checkbox; check radio; open a submenu and focus its first item. |
| Space | Item | Same as Enter. With `closeOnSelect: false`, toggles checkbox/radio items without closing. |
| ArrowRight (RTL: ArrowLeft) | Submenu parent | Open the submenu and focus its first item. |
| ArrowLeft (RTL: ArrowRight) | Submenu | Close it and focus the parent item. |
| Escape | Submenu | Close that level only. |
| Escape | Top level | Close and focus the trigger. An enclosing Dialog stays open. |
| Tab / Shift+Tab | Menu | Close all levels; focus moves on from the trigger. |

## 14. ARIA contract

- Trigger: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` pointing at the menu.
- Menu: `role="menu"`, named by the trigger (`aria-labelledby`) or by the `label` option (`aria-label`).
- Items: `role="menuitem"`, `"menuitemcheckbox"`, or `"menuitemradio"`, roving `tabindex` (`0` on the focused item of a level, `-1` on the others; Tab still closes the menu, so this adds no tab stop, and a menu that scrolls past `popover-max-height` stays keyboard-reachable for checkers such as axe), named by their label (`aria-labelledby`); description and shortcut are referenced by `aria-describedby`.
- Checkable items: `aria-checked="true" | "false"`. Disabled items: `aria-disabled="true"`.
- Submenu parents: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; the submenu is labelled by the parent's label.
- Groups: `role="group"` with `aria-labelledby` pointing at the visible group label. Separators: `role="separator"`.
- Icons are `aria-hidden`.

## 15. Accessibility notes

- Real DOM focus moves to items (roving focus); screen readers announce each item as it receives focus.
- Disabled items stay focusable (APG) so users can discover them; they cannot be activated.
- Focus follows the pointer on hover, so pointer and keyboard users share one current item.
- Focus returns to the trigger on activation and on Escape at the top level.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The popup is 10rem to `min(22rem, 100vw - 1rem)` wide. Its height is capped by `popover-max-height` and by the space available in the viewport, then it scrolls. The positioning engine flips and shifts every level to keep it on screen.

## 17. RTL behavior

With `direction: 'rtl'` (inherited from the global direction by default), submenus open to the left (`left-start`), ArrowLeft opens a submenu and ArrowRight closes it, and the submenu chevron is mirrored through `[data-direction='rtl']`. Item content uses logical properties; the top-level `start` alignment follows the direction.

## 18. Theme behavior

Colors come from role tokens only. Verified in the light, dark, and high-contrast themes. Danger items use `color-error-fg` text. In forced-colors mode the focused item is drawn in `Highlight` / `HighlightText` and disabled items in `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { menu: { placement: 'bottom-end', closeOnSelect: false } } });
```

Changes apply to existing instances: `direction` updates immediately; `placement` is re-applied to an open menu.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.submenu` (default `chevron-right`), `icons.checked` (default `check`), and `icons.radio` (default `check`). Item icons are set per item with `icon`.

## 23. Security behavior

All text uses `textContent`; nothing is parsed as HTML. Positioning writes styles through the CSSOM. CSP-safe; verified under a strict CSP with Trusted Types enforced.

## 24. Data handling behavior

No persistence, network access, or telemetry. Checkbox and radio state is kept in memory and reset by `update({ items })`.

## 25. Performance characteristics

All levels are built once per `items` change. Four delegated listeners per level, two on the trigger, and one configuration subscription. Budget: under 100 ms for `Menu.create` plus `open()` with 200 items.

## 26. Supported data scale

Tested with 200 items in one level and three nested levels. For longer lists, prefer a Combobox with filtering.

## 27. Usage examples

```ts
import { Menu } from '@absoluteui/components/menu';

const trigger = document.querySelector<HTMLButtonElement>('#row-actions');
if (trigger) {
  Menu.create(trigger, {
    items: [
      { id: 'edit', label: 'Edit' },
      { id: 'share', label: 'Share', items: [{ id: 'email', label: 'Email' }, { id: 'link', label: 'Copy link' }] },
      { type: 'separator' },
      { id: 'delete', label: 'Delete', tone: 'danger' },
    ],
  });
}
```

More examples, type-checked in CI: `metadata/menu/examples.json`.

## 28. Edge cases

- An empty `items` array is allowed; the menu opens with focus on the menu container.
- Duplicate ids anywhere in the tree, including submenus and groups, throw `MENU_OPTIONS`.
- Activating a checked radio item keeps it checked and still emits `aui-select` with `checked: true`.
- `update({ items })` while open keeps focus on the item with the same id when it is still at the top level; otherwise focus moves to the first enabled item.
- A trigger without an id gets a generated one, which `destroy()` removes.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `MENU_TRIGGER` | configuration | The trigger is not a `<button>` or has no parent node. |
| `MENU_OPTIONS` | configuration | `items` not an array, missing or empty label or id, duplicate id, empty submenu, missing radio group, non-boolean `checked`, or an empty `label` option. |
| `CFG_INVALID_VALUE` | configuration | Invalid `placement`, `closeOnSelect`, `typeahead`, or `direction`. |

A failed construction leaves no rendering, trigger attributes, listeners, or subscriptions behind.

## 30. Known limitations

- Submenus open after a 150 ms hover delay without a pointer-safe triangle.
- Shortcut text is a hint; the menu does not bind shortcuts or set `aria-keyshortcuts`.
- Radio groups are scoped by group name across the whole tree.
- No horizontal menubar mode; use Menu Bar.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML or custom nodes inside items.
- Link items (`href`); navigate in the `aui-select` listener.
- Context menus positioned at the pointer.

## 32. TypeScript definitions

```ts
type MenuItem =
  | { type?: 'item'; id: string; label: string; icon?: IconRef; description?: string; shortcut?: string; disabled?: boolean; tone?: 'default' | 'danger'; items?: readonly MenuItem[] }
  | { type: 'checkbox'; id: string; label: string; checked: boolean; disabled?: boolean }
  | { type: 'radio'; id: string; label: string; group: string; checked: boolean; disabled?: boolean }
  | { type: 'separator' }
  | { type: 'group'; label: string; items: readonly MenuItem[] };
interface MenuSelectDetail { id: string; item: MenuSelectableItem; checked?: boolean }
interface MenuIcons { submenu: IconRef; checked: IconRef; radio: IconRef }
```

## 33. Vanilla JS example

```ts
import { Menu, type MenuSelectDetail } from '@absoluteui/components/menu';
import '@absoluteui/components/menu/style.css';

const trigger = document.querySelector<HTMLButtonElement>('#view-menu');
if (trigger) {
  Menu.create(trigger, {
    closeOnSelect: false,
    items: [
      { type: 'checkbox', id: 'wrap', label: 'Word wrap', checked: true },
      { type: 'group', label: 'Density', items: [
        { type: 'radio', id: 'compact', label: 'Compact', group: 'density', checked: false },
        { type: 'radio', id: 'comfortable', label: 'Comfortable', group: 'density', checked: true },
      ] },
    ],
  });
  trigger.addEventListener('aui-select', (event) => {
    const { id, checked } = (event as CustomEvent<MenuSelectDetail>).detail;
    document.body.dataset[id] = String(checked);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { MenuItem, MenuSelectDetail } from '@absoluteui/components/menu';
import { AuiMenu } from '@absoluteui/angular/menu';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-row-actions',
  imports: [AuiMenu, AuiButton],
  template: `<button type="button" auiButton [auiMenu]="items" placement="bottom-end" (selected)="onSelect($event)">Actions</button>`,
})
export class RowActionsComponent {
  readonly items: MenuItem[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'delete', label: 'Delete', tone: 'danger' },
  ];

  onSelect(detail: MenuSelectDetail): void {
    if (detail.id === 'delete') {
      // confirm and delete
    }
  }
}
```

The directive is placed on the trigger button (the menu is created with a trigger rather than a host). Inputs mirror the options.

## 35. React example

```tsx
import { AuiButton } from '@absoluteui/react/button';
import { AuiMenu } from '@absoluteui/react/menu';

const items = [{ id: 'duplicate', label: 'Duplicate' }, { id: 'archive', label: 'Archive' }];

export function Example({ run }: { run: (id: string) => void }) {
  return (
    <AuiMenu items={items} onSelect={({ id }) => { run(id); }}>
      <AuiButton>Actions</AuiButton>
    </AuiMenu>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiButton } from '@absoluteui/vue/button';
import { AuiMenu } from '@absoluteui/vue/menu';
const items = [{ id: 'duplicate', label: 'Duplicate' }, { id: 'archive', label: 'Archive' }];
const emit = defineEmits<{ run: [id: string] }>();
</script>

<template>
  <AuiMenu :items="items" @select="({ id }) => emit('run', id)">
    <AuiButton>Actions</AuiButton>
  </AuiMenu>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
