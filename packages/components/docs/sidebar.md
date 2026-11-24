# Sidebar

> Package: `@absoluteui/components/sidebar` | Styles: `@absoluteui/components/sidebar/style.css` | Since 0.3.0 | Status: R2
>
> Drawer mode also needs `@absoluteui/components/drawer/style.css` and `@absoluteui/components/button/style.css`; the icon-rail tooltips need `@absoluteui/components/tooltip/style.css`.

## 1. Purpose

Application side navigation. `Sidebar` renders a labelled `<nav>` with a list of links (buttons for items without an `href`) and nested groups that expand as disclosures (WAI-ARIA APG Disclosure Navigation). The active item carries `aria-current="page"`. The sidebar can collapse to an icon rail whose labels appear as tooltips, and below a viewport breakpoint it moves into a modal Drawer that the application opens from its own menu button. Activation emits a cancelable `aui-navigate`, so client-side routers can take over. Collapsed, expanded-group, and mode changes are reported through events; nothing is persisted.

## 2. Anatomy

```text
<aside class="aui-sidebar">                                            (consumer host)
  <nav class="aui-sidebar__nav" id="aui-sidebar-…" aria-label="Main">
    <ul class="aui-sidebar__list">
      <li class="aui-sidebar__entry">
        <a class="aui-sidebar__item" href="/" data-id="home" aria-current="page">
          <span class="aui-sidebar__icon" aria-hidden="true"><svg class="aui-icon">...</svg></span>
          <span class="aui-sidebar__label">Home</span>
        </a>
      </li>
      <li class="aui-sidebar__entry">
        <button type="button" class="aui-sidebar__item aui-sidebar__group" data-id="reports" aria-controls="aui-sidebar-group-…" aria-expanded="true">
          <span class="aui-sidebar__icon aui-sidebar__icon--initial" aria-hidden="true">R</span>   (no icon: first letter, rail only)
          <span class="aui-sidebar__label">Reports</span>
          <svg class="aui-icon aui-sidebar__chevron" aria-hidden="true">
        </button>
        <ul class="aui-sidebar__list aui-sidebar__list--nested" id="aui-sidebar-group-…">...</ul>
      </li>
      <li class="aui-sidebar__entry"><button type="button" class="aui-sidebar__item" data-id="settings">...</button></li>  (no href)
      <li class="aui-sidebar__entry"><a class="aui-sidebar__item" role="link" aria-disabled="true" data-id="billing">...</a></li> (disabled)
    </ul>
  </nav>
  <div class="aui-sidebar__footer">                                     (hidden when collapsible: false)
    <button type="button" class="aui-sidebar__toggle" aria-controls="aui-sidebar-…" aria-label="Collapse sidebar"><svg class="aui-icon">...</svg></button>
  </div>
</aside>
```

In drawer mode the `<nav>` moves into the body of a modal `<dialog class="aui-drawer">` appended to `document.body`, and the host gets `aui-sidebar--drawer` (`display: none`). In the rail, each item (including disabled ones), group button, and the toggle get a `role="tooltip"` element (appended to `document.body`, or to the enclosing `<dialog>`).

## 3. When to use

- Primary or secondary navigation of an application with more destinations than fit in a top bar.
- Hierarchical navigation with one or two levels of groups.
- Layouts that need an icon rail on desktop and a drawer on small screens.

## 4. When not to use

- A handful of top-level destinations: use a top navigation bar or Tabs.
- Commands rather than destinations: use Menu or buttons.
- The current page's position in a hierarchy: use Breadcrumb.
- Deep, file-system-like trees (more than three levels): use a tree view.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `nav` | `HTMLElement` | The `<nav>`; in the host inline, in the drawer body in drawer mode. |
| `value` | `string \| null` | Active item id. |
| `collapsed` | `boolean` | Whether the icon rail is requested (applied inline only). |
| `expanded` | `string[]` | Expanded group ids, in tree order. |
| `mode` | `'inline' \| 'drawer'` | `'drawer'` below the breakpoint. |
| `isOpen` | `boolean` | Whether the drawer is open; always `false` inline. |
| `options` | `Readonly<SidebarOptions>` | Current options. |

| Option | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | `<nav>` accessible name and drawer title. Must not be empty. |
| `items` | `readonly SidebarItem[]` | required | At least one item; groups need at least one child. Ids unique across the tree; labels non-empty. |
| `value` | `string` | none | Active item; must be a non-group item. |
| `collapsed` | `boolean` | `false` | Icon rail (inline only). |
| `expanded` | `readonly string[]` | groups containing `value` | Expanded groups; group ids only. |
| `icons` | `Partial<SidebarIcons>` | - | Icon overrides. |

| Global option | Type | Default |
|---|---|---|
| `collapsible` | `boolean` | `true` |
| `breakpoint` | integer `0`-`4096` (CSS px; `0` never switches) | `768` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

Full table: `metadata/sidebar/api.json`.

## 6. Methods

| Method | Description |
|---|---|
| `Sidebar.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before touching the host. |
| `open()` | Open the drawer and move focus into it. No-op in inline mode. |
| `close()` | Close the drawer; focus returns to the element focused before `open()`. No-op when closed or inline. |
| `toggle()` | `close()` when open, otherwise `open()`. |
| `select(id)` | Mark a non-group item active and expand its groups. No events; does not close the drawer. Throws `SIDEBAR_OPTIONS` for an unknown or group id. |
| `update(options)` | Merge, validate, and apply options. Focus stays on the item with the same id. An active id missing from new `items` becomes `null`; passing `value` expands its groups. No events. A failed update keeps the previous state. |
| `destroy()` | Remove rendering, host classes, tooltips, the drawer, the media query listener, listeners, and the configuration subscription. |

## 7. Events

Dispatched on the host (also in drawer mode).

| Event | Detail | Bubbles | Cancelable | Description |
|---|---|---|---|---|
| `aui-navigate` | `{ id, item }` | Yes | Yes | The user activated an enabled item. `preventDefault()` stops link navigation, the active change, and the drawer close. |
| `aui-change` | `{ value, previous }` | Yes | No | The active item changed after an uncanceled `aui-navigate`. Not emitted when the already active item is activated. |
| `aui-expanded-change` | `{ id, expanded, value }` | Yes | No | The user toggled group `id`; `value` lists all expanded groups in tree order. |
| `aui-collapsed-change` | `{ collapsed }` | Yes | No | The user activated the collapse toggle. |
| `aui-mode-change` | `{ mode }` | Yes | No | The viewport crossed the breakpoint. The mode found during creation is not reported. |

Modified clicks on links (Ctrl, Meta, Shift, Alt, or a non-primary button) keep native behavior and are not reported. Programmatic changes (`select()`, `update()`, `open()`, `close()`) never emit events.

SPA routing pattern: in `aui-navigate`, call `preventDefault()`, route, then `select(id)` and `close()`.

## 8. Slots/content areas

None. Items are data; labels are text.

## 9. CSS parts/hooks

| Class / property | Purpose |
|---|---|
| `--aui-sidebar-width` | Inline width (default `16rem`). Set on `.aui-sidebar`. |
| `--aui-sidebar-rail-width` | Rail width (default `control-height-md` + 2 x `space-2`). |
| `aui-sidebar` | Host. |
| `aui-sidebar--collapsed` | Icon rail (inline only). |
| `aui-sidebar--drawer` | Drawer mode; the host is `display: none`. |
| `aui-sidebar__nav` | The `<nav>`. |
| `aui-sidebar__list`, `__list--nested` | Top-level and group lists. |
| `aui-sidebar__entry` | `<li>`. |
| `aui-sidebar__item` | Link, button, disabled link, or group button; `data-id` is the item id. |
| `aui-sidebar__group` | Group disclosure button. |
| `aui-sidebar__item--contains-active` | Collapsed group containing the active item (semibold). |
| `aui-sidebar__icon`, `__icon--initial`, `__label`, `__chevron` | Item parts. |
| `aui-sidebar__footer`, `__toggle` | Footer and collapse toggle. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/sidebar/tokens.json` (27 tokens, verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `color-hover`, `color-selected`, `color-selected-text`, `color-text-disabled`, `control-height-md`, `icon-size-md`, `radius-md`, `space-1|2|3|4`, `duration-fast`, `easing-standard`. The drawer and tooltips use their own tokens.

## 11. States

Sidebar: inline, collapsed (icon rail), drawer closed, drawer open. Items: default, hover, focus-visible, active (`aria-current="page"`), disabled. Groups: expanded, collapsed, collapsed containing the active item.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| item A active | enabled item B activated | `aui-navigate`; unless prevented: B active, its groups expand, `aui-change`, drawer closes |
| any | `aui-navigate` prevented | unchanged; links do not navigate; drawer stays open |
| group collapsed | group button activated | expanded, `aui-expanded-change` (and back) |
| full | toggle activated | rail, `aui-collapsed-change` (and back) |
| inline | viewport narrower than `breakpoint` | drawer (closed), `aui-mode-change` |
| drawer | viewport at or above `breakpoint` | inline, drawer closed, `aui-mode-change` |
| drawer closed | `open()` / `toggle()` | drawer open, focus inside |
| drawer open | `close()`, Escape, backdrop, close button, uncanceled navigation | drawer closed, focus restored |
| any | `collapsible` becomes `false` | full width, toggle hidden, no event |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves between enabled items, group buttons, and the toggle. Disabled items and items in collapsed groups are skipped. |
| Enter | Link focused | `aui-navigate`; unless prevented, the item becomes active and the link navigates natively. |
| Enter / Space | Button item focused | Same as a link, without native navigation. |
| Enter / Space | Group button focused | Expands or collapses the group; focus stays. |
| Enter / Space | Toggle focused | Switches between full and rail; focus stays. |
| Escape | Drawer open | Closes the drawer (Drawer `closeOnEscape`) and restores focus. |
| Escape | Rail tooltip visible | Hides the tooltip without moving focus. |

There is no arrow-key navigation.

## 14. ARIA contract

- `<nav aria-label>` landmark named by `label`; lists are `<ul>`/`<li>`.
- Active item: `aria-current="page"`.
- Groups: `<button type="button" aria-expanded aria-controls>`; the nested `<ul>` is `hidden` while collapsed.
- Disabled items: `<a role="link" aria-disabled="true">` without `href` (not focusable).
- Icons, initials, and chevrons: `aria-hidden="true"`.
- Toggle: localized `aria-label` "Collapse sidebar" / "Expand sidebar", `aria-controls` -> the `<nav>`.
- Rail: each enabled item, group button, and the toggle has `aria-labelledby` -> its `role="tooltip"` element (Tooltip `relation: 'label'`); the visually hidden label stays in the DOM. Removed when the rail is left.
- Drawer mode: modal `<dialog>` labelled by its title (the `label` option).

## 15. Accessibility notes

- The active item is conveyed by `aria-current`, a selected background, and semibold weight, not color alone.
- Accessible names do not change between full and rail views.
- Toggling a group, activating an item, and `update()` keep focus on the same item id.
- Drawer mode inherits Drawer's modal behavior: inert background, focus containment, focus restoration to the menu button.
- The application's menu button that opens the drawer needs its own accessible name.
- In the rail, disabled items also get a tooltip (their only visible name).
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Inline width is `--aui-sidebar-width`, or `--aui-sidebar-rail-width` in the rail, animated with `duration-fast` (none under reduced motion or `data-aui-animation='none'`). The host is `max-inline-size: 100%`; the `<nav>` scrolls when items overflow. Below `breakpoint` viewport px (`matchMedia('(max-width: breakpoint − 0.02px)')`) the `<nav>` moves into a modal start-edge Drawer (size `sm`), the host is removed from layout, and `collapsed` is ignored. At or above the breakpoint the drawer closes and the `<nav>` returns to the host. `breakpoint: 0` keeps the sidebar inline at every width.

## 17. RTL behavior

Logical properties throughout: the border sits on the inline-end edge; nested lists indent from the inline start. `direction: 'rtl'` sets `dir="rtl"` on the `<nav>` and footer; with `'ltr'` no `dir` is set, so an ancestor `dir="rtl"` applies. The toggle chevrons are mirrored under `:dir(rtl)`. Rail tooltips open to the left in RTL and to the right in LTR. The drawer opens from the right edge in RTL. The RTL state for tooltips and the drawer is resolved on render; changing an ancestor `dir` later takes effect on the next render (`update()` or a configuration change).

## 18. Theme behavior

Role tokens only. Hover: `color-hover`. Active: `color-selected` background, `color-selected-text`, semibold. Disabled: `color-text-disabled`. Forced-colors mode: `Highlight`/`HighlightText` active item, `GrayText` disabled items, `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { sidebar: { collapsible: false, breakpoint: 1024 } } });
```

Changes apply to existing instances immediately, including the breakpoint listener. The drawer's own options (`closeOnEscape`, `closeOnBackdrop`, `showCloseButton`) follow the `drawer` global configuration; `placement` (`start`) and `size` (`sm`) are fixed by the sidebar.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic through `update()`.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

| Slot | Default | Used for |
|---|---|---|
| `icons.group` | `chevron-down` | Group indicator (rotated 180 deg while expanded). |
| `icons.collapse` | `chevrons-left` | Toggle while full (mirrored in RTL). |
| `icons.expand` | `chevrons-right` | Toggle while collapsed (mirrored in RTL). |

Each item's `icon` is an `IconRef`. Items without `icon` show the first character of their label in the rail only.

## 23. Security behavior

Labels use `textContent`. Each `href` is parsed with the URL standard against `document.baseURI`; only `http:`/`https:` and scheme-less URLs are accepted. `javascript:`, `data:`, and other schemes, including obfuscations such as `java\tscript:`, throw `SIDEBAR_OPTIONS`; the error names the property path but never echoes the value. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Active item, expanded groups, collapsed state, and mode live in memory. To remember them, store the event details (`aui-collapsed-change`, `aui-expanded-change`) and pass them back as `collapsed` / `expanded`.

## 25. Performance characteristics

One click listener on the `<nav>`, one on the toggle, one configuration subscription, and one media query listener (none when `breakpoint` is `0`) per instance. Active, expanded, and collapsed changes update attributes in place; `update()` and configuration changes rebuild the list. The rail creates one Tooltip per control. Budget: `Sidebar.create` with 200 items in nested groups under 50 ms in headless Chromium.

## 26. Supported data scale

Up to a few hundred items across up to three levels. Tested with 4 top-level items and a group nested two levels deep.

## 27. Usage examples

```ts
import { Sidebar } from '@absoluteui/components/sidebar';

const host = document.createElement('aside');
document.body.append(host);
Sidebar.create(host, {
  label: 'Main',
  value: 'sales',
  items: [
    { id: 'dashboard', label: 'Dashboard', href: '/', icon: 'menu' },
    { type: 'group', id: 'reports', label: 'Reports', items: [{ id: 'sales', label: 'Sales', href: '/reports/sales' }] },
  ],
});
```

More examples, type-checked in CI: `metadata/sidebar/examples.json`.

## 28. Edge cases

- Without `value`, no item is active and all groups start collapsed (unless `expanded` is given).
- Groups cannot be active; `value` and `select()` accept non-group items only.
- An item is a group only when `type: 'group'`; an item with `items` but without `type: 'group'` throws `SIDEBAR_OPTIONS`.
- Activating the already active item emits `aui-navigate` (and closes the drawer) but no `aui-change`.
- `collapsible: false` forces `collapsed` to `false` without an event; it stays `false` if `collapsible` becomes `true` again.
- `collapsed: true` in drawer mode is kept but not applied until the sidebar returns inline.
- Groups remain operable in the rail; their children show below them without indentation.
- `update({ items })` without `value` keeps the active id when it still exists, otherwise sets it to `null`.
- `select()` does not close the drawer.
- Opening the drawer inline (`open()`) is a no-op; no dialog is created until the first switch to drawer mode.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SIDEBAR_OPTIONS` | configuration | Empty `label`; empty `items` or group `items`; an item that is not an object; an empty or duplicate `id` (across the tree); an empty item `label`; `type` other than `'item'`/`'group'`; an unsafe or unparsable `href`; `value` (or `select(id)`) not a non-group item; non-boolean `collapsed`; `expanded` not an array of group ids. `property` is a path such as `sidebar.items[1].items[0].href`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `collapsible`, `breakpoint` (not an integer 0-4096), or `direction` (instance or global configuration). |

A failed construction leaves the host untouched: no children, classes, listeners, subscriptions, drawer, or media query listener. A failed `update()` keeps the previous options and rendering.

## 30. Known limitations

- No arrow-key navigation; every enabled item is a Tab stop.
- The breakpoint follows the viewport, not the container.
- The application must provide the menu button that opens the drawer.
- Nothing is persisted.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML or custom nodes in labels.
- Hrefs with schemes other than http and https.
- Groups that are also links.
- Badges, counters, or secondary actions inside items.
- Drag-to-resize.

## 32. TypeScript definitions

```ts
interface SidebarConfig { collapsible: boolean; breakpoint: number }
interface SidebarLink { type?: 'item'; id: string; label: string; href?: string; icon?: IconRef; disabled?: boolean }
interface SidebarGroup { type: 'group'; id: string; label: string; icon?: IconRef; items: readonly SidebarItem[] }
type SidebarItem = SidebarLink | SidebarGroup;
type SidebarMode = 'inline' | 'drawer';
interface SidebarIcons { group: IconRef; collapse: IconRef; expand: IconRef }
interface SidebarOptions extends Partial<SidebarConfig> {
  label: string; items: readonly SidebarItem[]; value?: string; collapsed?: boolean;
  expanded?: readonly string[]; direction?: Direction; icons?: Partial<SidebarIcons>;
}
interface SidebarNavigateDetail { id: string; item: SidebarLink }
interface SidebarChangeDetail { value: string; previous: string | null }
interface SidebarExpandedChangeDetail { id: string; expanded: boolean; value: string[] }
interface SidebarCollapsedChangeDetail { collapsed: boolean }
interface SidebarModeChangeDetail { mode: SidebarMode }
```

## 33. Vanilla JS example

```ts
import { Sidebar, type SidebarModeChangeDetail, type SidebarNavigateDetail } from '@absoluteui/components/sidebar';
import '@absoluteui/components/sidebar/style.css';
import '@absoluteui/components/drawer/style.css';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/tooltip/style.css';

const host = document.querySelector<HTMLElement>('#app-sidebar');
const menuButton = document.querySelector<HTMLButtonElement>('#app-menu');
if (host && menuButton) {
  const sidebar = Sidebar.create(host, {
    label: 'Main',
    value: 'inbox',
    items: [
      { id: 'inbox', label: 'Inbox', href: '/inbox' },
      { id: 'archive', label: 'Archive', href: '/archive' },
    ],
  });
  menuButton.hidden = sidebar.mode === 'inline';
  menuButton.addEventListener('click', () => {
    sidebar.toggle();
  });
  host.addEventListener('aui-mode-change', (event) => {
    menuButton.hidden = (event as CustomEvent<SidebarModeChangeDetail>).detail.mode === 'inline';
  });
  host.addEventListener('aui-navigate', (event) => {
    const { id, item } = (event as CustomEvent<SidebarNavigateDetail>).detail;
    if (item.href === undefined) return;
    event.preventDefault();
    history.pushState(null, '', item.href);
    sidebar.select(id);
    sidebar.close();
  });
}
```

## 34. Angular example

```ts
import { Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { SidebarItem, SidebarNavigateDetail } from '@absoluteui/components/sidebar';
import { AuiSidebar } from '@absoluteui/angular/sidebar';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-shell-nav',
  imports: [AuiSidebar, AuiButton],
  template: `
    @if (mode !== 'inline') {
      <button type="button" auiButton variant="ghost" (click)="sidebar.toggle()">Menu</button>
    }
    <aui-sidebar #sidebar="auiSidebar" label="Main" [items]="items" [value]="active" [(collapsed)]="collapsed"
      (modeChange)="mode = $event.mode"
      (aui-navigate)="go($event)"></aui-sidebar>
  `,
})
export class ShellNavComponent {
  private readonly router = inject(Router);
  private readonly sidebarRef = viewChild.required<AuiSidebar>('sidebar');
  readonly items: SidebarItem[] = [
    { id: 'inbox', label: 'Inbox', href: '/inbox' },
    { id: 'archive', label: 'Archive', href: '/archive' },
  ];
  active = 'inbox';
  collapsed = false;
  mode: 'inline' | 'drawer' = 'inline';

  go(event: Event): void {
    const { id, item } = (event as CustomEvent<SidebarNavigateDetail>).detail;
    if (item.href === undefined) return;
    event.preventDefault();
    this.active = id;
    void this.router.navigateByUrl(item.href);
    this.sidebarRef().close();
  }
}
```

`<aui-sidebar>` is generated; inputs mirror the options; `[(value)]`, `[(expanded)]`, and `[(collapsed)]` are two-way; outputs are `navigate`, `changed`, `groupToggled`, and `modeChange`; methods `open()`, `close()`, `toggle()`, `select()`. Outputs carry only the event `detail`, so the router handler that calls `preventDefault()` must bind the DOM event `(aui-navigate)`. The initial mode is not reported by `modeChange`; it is reported when it changes.

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
