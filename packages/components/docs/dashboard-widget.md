# Dashboard Widget

> Package: `@absoluteui/components/dashboard-widget` | Styles: `@absoluteui/components/dashboard-widget/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

A titled dashboard panel (widget container, collapsible widget, dashboard tile). `DashboardWidget` enhances a host element in place: a header with a heading, an optional subtitle, and action buttons (custom icon actions, collapse, maximize, remove) is inserted as the host's first child. The host's other children are the body; they are never moved, so framework-owned content is safe. Collapse is a disclosure button. Maximize shows the widget in the top layer as a modal dialog. Remove emits a cancelable event; the application removes the widget or its Dashboard Grid item.

## 2. Anatomy

```text
<section class="aui-widget [aui-widget--collapsed] [aui-widget--maximized]" role="region" aria-labelledby="{title id}" [aria-busy]>  (consumer host)
  <div class="aui-widget__header">                                  (inserted first)
    <div class="aui-widget__titles">
      <h3 class="aui-widget__heading"><span class="aui-widget__title" id>Title</span></h3>
      <p class="aui-widget__subtitle">                             (hidden when empty)
    </div>
    <div class="aui-widget__actions">
      <button class="aui-widget__action aui-widget__action--custom" data-action="custom:{id}">   (actions)
      <button class="aui-widget__action aui-widget__toggle" aria-expanded>                       (collapsible)
      <button class="aui-widget__action aui-widget__maximize">                                   (maximizable)
      <button class="aui-widget__action aui-widget__remove">                                     (removable)
    </div>
  </div>
  ...body: the host's own children, untouched...
</section>
```

## 3. When to use

- Panels inside a Dashboard Grid (set `data-aui-item` on the host).
- Titled dashboard blocks that users collapse, expand to full screen, or remove.

## 4. When not to use

- Content cards without widget actions: use Card.
- Dialogs opened from elsewhere: use Dialog.
- Sections that should not be landmarks (the host becomes `role="region"` unless it has another role).

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The enhanced host. |
| `header` | `HTMLDivElement` | The inserted header. |
| `collapsed` | `boolean` | Collapsed state. |
| `maximized` | `boolean` | Maximized (modal) state. |

Options (`DashboardWidgetOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | required | Heading text; names the region and the actions. |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6` | `3` | Init-only. |
| `subtitle` | `string` | - | Supporting text. |
| `actions` | `readonly DashboardWidgetAction[]` | - | `{ id, label, icon }` header icon buttons; emit `aui-action`. |
| `removable` | `boolean` | `false` | Remove button (`aui-remove`). |
| `collapsed` | `boolean` | `false` | Initial and controlled collapsed state. |
| `busy` | `boolean` | `false` | `aria-busy="true"` on the host. |
| `collapsible` | `boolean` | `true` | Collapse button (global). |
| `maximizable` | `boolean` | `true` | Maximize button (global). |
| `locale`, `direction` | - | inherited | Button names (global, inherited). |

## 6. Methods

| Method | Description |
|---|---|
| `DashboardWidget.create(host, options)` | Enhance `host`; the header is prepended. Throws `DASHBOARD_WIDGET_OPTIONS` on invalid options before touching the host. |
| `update(options)` | Merge and re-render the header; `collapsed` applies without an event. Changing `headingLevel` throws. |
| `setCollapsed(collapsed)` | Collapse or expand; no event. |
| `setMaximized(maximized)` | Maximize or restore; emits `aui-maximize` when the state changes. |
| `destroy()` | Restore if maximized; remove the header, classes, `aria-busy`, `aria-labelledby`, and the region role. The body stays. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | Description |
|---|---|---|---|---|
| `aui-toggle` | `{ collapsed }` | No | No | The user activated the collapse button. |
| `aui-maximize` | `{ maximized }` | No | No | Maximized or restored (button, Escape, or `setMaximized`). |
| `aui-action` | `{ id }` | Yes | No | A custom action was activated. |
| `aui-remove` | `{ id: string \| null }` | Yes | Yes | The remove button was activated; `id` is the host's `data-aui-item` or `null`. The widget has no default action: remove it (or call `grid.removeItem(id)`). |

## 8. Slots/content areas

The body is every host child except the header. It stays in place and is hidden with `display: none` while collapsed (the elements remain in the DOM).

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-widget`, `--collapsed`, `--maximized` | Host and state modifiers. |
| `aui-widget__header`, `__titles`, `__heading`, `__title`, `__subtitle` | Header parts. |
| `aui-widget__actions`, `aui-widget__action` | Action group and buttons (`--custom`, `aui-widget__toggle`, `aui-widget__maximize`, `aui-widget__remove`; `data-action` = `custom:<id>`, `toggle`, `maximize`, `remove`). |

Inside an editing Dashboard Grid (`.aui-dashboard--editing`) the header reserves room for the move handle. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/dashboard-widget/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `radius-lg`, `shadow-sm`, `shadow-lg`, `color-backdrop`, `space-inset`, `touch-target-min`.

## 11. States

expanded, collapsed, maximized (modal), busy, action hover, action focus-visible.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| expanded | collapse button | collapsed; `aui-toggle { collapsed: true }` |
| collapsed | expand button | expanded; `aui-toggle { collapsed: false }` |
| any | maximize button / `setMaximized(true)` | maximized: `role="dialog"`, `aria-modal`, top layer, focus trapped, scroll locked; `aui-maximize` |
| maximized | Escape, restore button, `setMaximized(false)` | previous role restored; focus to the maximize button; `aui-maximize` |
| any | `update({ collapsed })`, `setCollapsed()` | collapsed state set, no event |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Header buttons and body content in DOM order. |
| Enter / Space | Collapse button | Toggles the body; focus stays. |
| Enter / Space | Maximize button | Maximizes; focus moves to the restore button. |
| Escape | Maximized | Restores; focus returns to the maximize button. |
| Tab / Shift+Tab | Maximized | Cycles within the widget. |
| Enter / Space | Remove / custom action | Emits `aui-remove` / `aui-action`. |

## 14. ARIA contract

- Host: `role="region"` (kept if the page set another role) with `aria-labelledby` pointing at the title; `aria-busy="true"` while `busy`.
- Maximized: `role="dialog"`, `aria-modal="true"`, same label.
- Collapse button: `aria-expanded`. Every action has `aria-label` and `title`: "Collapse {title}" / "Expand {title}", "Maximize {title}" / "Restore {title}", "Remove {title}", or the custom label.

## 15. Accessibility notes

- Action names include the title, so several widgets remain distinguishable.
- Collapsed bodies are `display: none`: removed from the accessibility tree and tab order.
- Maximized, focus is trapped and outside presses do not restore; Escape and the restore button do (WCAG 2.1.2: no trap without an exit).
- The collapse button is hidden while maximized. Manual screen-reader verification is pending.

## 16. Responsive behavior

Fills its container and scrolls its content (`overflow: auto`). Actions wrap. Maximized, the widget is fixed over the viewport inset by `space-6`. Action buttons are at least `touch-target-min`.

## 17. RTL behavior

Logical properties throughout; the collapsed chevron rotation is mirrored.

## 18. Theme behavior

Role tokens only; maximized uses `shadow-lg` and a `color-backdrop` backdrop. Forced colors: `CanvasText` border. The chevron transition is removed under reduced motion.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { dashboardWidget: { maximizable: false } } });
```

Global options: `collapsible`, `maximizable`, plus inherited `locale` and `direction`. Changes apply to existing widgets immediately.

## 20. Component configuration support

Instance options override global and theme defaults. All options are dynamic except `headingLevel`.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

Built-in actions use `chevron-down` (collapse), `maximize` / `minimize` (maximize / restore), and `trash` (remove). Custom actions take any `IconRef`.

## 23. Security behavior

Title, subtitle, and labels use `textContent` and attributes; the body is never read or re-parsed. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Store collapsed state from `aui-toggle` if needed.

## 25. Performance characteristics

The header is rebuilt on every `update()` (a handful of buttons); the body is untouched. One configuration subscription per instance; maximize adds a focus trap, a scroll lock, and an overlay registration only while maximized. Not separately budgeted: covered by the Dashboard Grid budget (`create` with 50 items < 40 ms in headless Chromium, e2e performance test).

## 26. Supported data scale

Dashboards of up to 50 widgets (the Dashboard Grid target).

## 27. Usage examples

```ts
import { DashboardWidget } from '@absoluteui/components/dashboard-widget';

const host = document.querySelector<HTMLElement>('#sales');
if (host) DashboardWidget.create(host, { title: 'Sales', subtitle: 'Last 30 days', removable: true });
```

More examples, type-checked in CI: `metadata/dashboard-widget/examples.json`.

## 28. Edge cases

- A host with its own role (other than `region`) keeps it; `aria-labelledby` is still set.
- Without `HTMLElement.showPopover` the maximized widget is fixed-positioned only, not in the top layer.
- Re-rendering keeps focus on the same action button.
- `aui-remove` does nothing by itself; `preventDefault()` only matters to other listeners.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DASHBOARD_WIDGET_OPTIONS` | configuration | Empty title; `headingLevel` outside 2..6 or changed by `update()`; non-boolean flags; invalid or duplicate action ids or empty labels. |

## 30. Known limitations

- Maximize depends on the Popover API for the top layer.
- No `aria-controls` on the collapse button.
- `headingLevel` is init-only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML in the title or subtitle.
- Non-modal full-screen mode.

## 32. TypeScript definitions

```ts
interface DashboardWidgetAction { id: string; label: string; icon: IconRef }
interface DashboardWidgetToggleDetail { collapsed: boolean }
interface DashboardWidgetMaximizeDetail { maximized: boolean }
interface DashboardWidgetActionDetail { id: string }
interface DashboardWidgetRemoveDetail { id: string | null }
```

## 33. Vanilla JS example

```ts
import { DashboardWidget } from '@absoluteui/components/dashboard-widget';
import '@absoluteui/components/dashboard-widget/style.css';

const host = document.querySelector<HTMLElement>('#tickets');
if (host) {
  DashboardWidget.create(host, { title: 'Open tickets', headingLevel: 2, removable: true, actions: [{ id: 'refresh', label: 'Refresh tickets', icon: 'refresh' }] });
  host.addEventListener('aui-remove', () => {
    host.remove();
  });
}
```

## 34. Angular example

`auiDashboardWidget` enhances its host in place; projected content is the body. Bind `title` as a property (`[title]`) so the host does not also get a native tooltip. Outputs: `auiToggle`, `auiMaximize`, `auiAction`, `auiRemove`.

```ts
import { Component } from '@angular/core';
import { AuiDashboardWidget } from '@absoluteui/angular/dashboard-widget';

@Component({
  selector: 'app-sales-widget',
  imports: [AuiDashboardWidget],
  template: `
    <aui-dashboard-widget [title]="'Sales'" subtitle="Last 30 days" [removable]="true" (removed)="removed = true">
      <p>$48,200</p>
    </aui-dashboard-widget>`,
})
export class SalesWidgetComponent {
  removed = false;
}
```

## 35. React example

```tsx
import { AuiDashboardWidget } from '@absoluteui/react/dashboard-widget';

export function Example({ onRemove }: { onRemove: (id: string | null) => void }) {
  return (
    <AuiDashboardWidget title="Sales" subtitle="Last 30 days" removable onRemove={(d) => { onRemove(d.id); }} data-aui-item="sales">
      <p>$48,200</p>
    </AuiDashboardWidget>
  );
}
```

The component renders a `<section>`; its children are the body. See [docs/REACT.md](../../../docs/REACT.md) for events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiDashboardWidget } from '@absoluteui/vue/dashboard-widget';
const emit = defineEmits<{ remove: [id: string | null] }>();
</script>

<template>
  <AuiDashboardWidget title="Sales" subtitle="Last 30 days" removable data-aui-item="sales" @remove="(d) => emit('remove', d.id)">
    <p>$48,200</p>
  </AuiDashboardWidget>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that enhance or render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
