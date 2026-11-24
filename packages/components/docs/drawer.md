# Drawer

> Package: `@absoluteui/components/drawer` | Styles: `@absoluteui/components/drawer/style.css` (requires the button styles for header and footer buttons) | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A panel that slides in from a screen edge, built on native `<dialog>`.
- Modal (default): `showModal()` gives top-layer rendering, an inert background, a backdrop, and native focus containment. AbsoluteUI adds scroll lock and focus restoration.
- Non-modal (`modal: false`): `show()` keeps the page interactive. Focus moves into the drawer on open, and Escape closes it when it is the topmost overlay.

Both modes share Dialog's close reasons and cancelable close events. Use non-modal drawers only for supplementary panels, such as filters or record details next to live content.

## 2. Anatomy

```text
<dialog class="aui-drawer aui-drawer--{modal|non-modal} aui-drawer--{placement} aui-drawer--{size}"
        data-aui-side="left|right|top|bottom" dir aria-labelledby aria-describedby>
  <header class="aui-drawer__header">
    <h2 class="aui-drawer__title">title</h2>
    <button class="aui-button aui-drawer__close" aria-label="Close">icon</button>
  </header>
  <p class="aui-drawer__description">description</p>
  <div class="aui-drawer__body">content</div>
  <footer class="aui-drawer__footer">action buttons</footer>
</dialog>
```

## 3. When to use

- Secondary tasks that keep page context visible, such as editing a record from a list.
- Navigation or settings panels on small screens (modal).
- Supplementary panels such as filters or details beside live content (non-modal).

## 4. When not to use

- Short confirmations or destructive prompts: use Dialog with `role: 'alertdialog'`.
- Primary page content or long multi-step flows: use a page.
- Content anchored to a trigger: use a popover or menu.
- Tasks that must be completed before continuing: do not use a non-modal drawer.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLDialogElement` | Native dialog. |
| `body` | `HTMLDivElement` | Content area for consumer nodes. |
| `isOpen` | `boolean` | Open state. |
| `modal` | `boolean` | Whether the drawer was created modal. |

Options (`DrawerOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `title` | `string` | - (required) | No | Accessible name / heading. |
| `description` | `string` | - | No | `aria-describedby` text. |
| `content` | `Node \| string` | - | No | Body; strings render as text. |
| `actions` | `DrawerAction[]` | `[]` | No | Footer buttons `{ label, value, variant?, autofocus? }`. |
| `modal` | `boolean` | `true` | No | Init-only. `false` uses `show()`; for supplementary panels only. |
| `icons` | `Partial<{ close: IconRef }>` | - | No | Icon slot overrides. |
| `placement` | `'start' \| 'end' \| 'top' \| 'bottom'` | `'end'` | Yes | Screen edge; `start`/`end` follow the writing direction. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | Inline size (side) or maximum block size (top/bottom). |
| `closeOnEscape` | `boolean` | `true` | Yes | Escape requests close when topmost. |
| `closeOnBackdrop` | `boolean` | `true` | Yes | Backdrop click requests close (modal only). Dialog defaults this to `false`. |
| `showCloseButton` | `boolean` | `true` | Yes | Header close button. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Maps `start`/`end` to a physical edge. |

## 6. Methods

| Method | Description |
|---|---|
| `Drawer.create(options, doc?)` | Create and append a closed drawer to `document.body`. |
| `open()` | Open, move focus inside, and remember focus for restoration. A modal drawer also locks scroll. Emits `aui-open`. |
| `close(returnValue?)` | Close programmatically. Not cancelable. Emits `aui-close` with reason `programmatic`. |
| `update(options)` | Merge and apply options. `modal` cannot be changed. |
| `destroy()` | Close if open, then remove the element, listeners, overlay registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | When |
|---|---|---|---|---|
| `aui-open` | `null` | No | No | After opening. |
| `aui-cancel` | `{ returnValue, reason }` | No | Yes | Before a user-initiated close (Escape, backdrop, close button, action). `preventDefault()` keeps the drawer open. |
| `aui-close` | `{ returnValue, reason }` | No | No | After closing. |

Reasons: `'escape' | 'backdrop' | 'close-button' | 'action' | 'programmatic'`. Lifecycle events do not bubble, so a nested combobox's `aui-close` never reaches the drawer's listeners.

## 8. Slots/content areas

`body` (or the `content` option) holds the drawer content.

## 9. CSS parts/hooks

`aui-drawer`, `aui-drawer--modal|non-modal`, `aui-drawer--start|end|top|bottom`, `aui-drawer--sm|md|lg`, `[data-aui-side='left|right|top|bottom']`, `aui-drawer__header`, `__title`, `__close`, `__description`, `__body`, `__footer`, and `::backdrop`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/drawer/tokens.json` (27 tokens, verified in CI). Key tokens: `color-surface`, `color-border`, `color-backdrop`, `shadow-lg`, `drawer-width-sm|md|lg`, `duration-normal`, `easing-standard`, `space-*`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-drawer-bg` (drawer background; falls back to `color-surface`), `--aui-drawer-shadow` (drawer elevation; falls back to `shadow-lg`), `--aui-drawer-padding` (drawer inline padding; falls back to `space-5`), `--aui-drawer-backdrop` (modal backdrop; falls back to `color-backdrop`).

## 11. States

closed, opening (slide-in), open, closing (an `aui-cancel` listener is pending), and closing (slide-out).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | `open()` | open (focus moves inside; modal: scroll locked, background inert) |
| open | Escape / backdrop (modal) / close button / action | `aui-cancel` -> closed, unless prevented |
| open | `close()` | closed (no `aui-cancel`) |
| open | consumer `<form method="dialog">` submit | closed (reason `action`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Modal open | Cycles through drawer controls; the background is inert. |
| Tab / Shift+Tab | Non-modal open | Follows document order; focus can reach the page. |
| Escape | Topmost overlay, `closeOnEscape: true` | `aui-cancel`, then close and restore focus. |
| Escape | `closeOnEscape: false` | No effect. The native close request is prevented, including repeated presses. |
| Escape | A nested overlay is open | Closes only the topmost overlay. |
| Enter / Space | Button focused | Activates. |

## 14. ARIA contract

- `aria-labelledby` -> title.
- `aria-describedby` -> description, when provided.
- Native `dialog` role; modal drawers are exposed as modal by `showModal()`.
- The close button has a localized `aria-label` ("Close").

## 15. Accessibility notes

- Initial focus goes to the action with `autofocus: true`, otherwise the first focusable element (native dialog focusing steps).
- A modal drawer returns focus to the element that was focused before `open()`.
- A non-modal drawer returns focus only when focus was inside the drawer at close, so users working in the page keep their place.
- Non-modal drawers do not trap focus. Keep them supplementary, and give users a visible way to reopen and close them.
- Slide motion is removed under `prefers-reduced-motion` and `data-aui-animation='none'`.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Side drawers use `min(drawer-width token, 100vw)` and the full viewport height. Top and bottom drawers use the full inline size and `max-block-size: min(drawer-width token, 85dvh)`. The body scrolls. Below 480px, side drawers take `100vw` and footer actions stack full-width.

## 17. RTL behavior

`start` and `end` resolve against the configured `direction`: `start` is the left edge in LTR and the right edge in RTL. The resolved edge is exposed as `data-aui-side`, the slide direction follows it, and the element receives `dir`. Inner layout uses logical properties; the close button sits at the inline end.

## 18. Theme behavior

Token-driven surface, border, shadow, and backdrop. Only the inner edge has a border. Forced-colors mode uses a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { drawer: { placement: 'start', size: 'lg', closeOnBackdrop: false } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All configurable options are dynamic; `modal` is init-only.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.close` (default `close`), resolved through the global icon provider/registry.

## 23. Security behavior

Title, description, and string content use `textContent`. No HTML parsing, no inline styles. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per open/close: one `showModal()`/`show()` call, one overlay-stack entry, one scroll-lock reference (modal), and one focus restore point. Budget: `open()` under 16 ms in headless Chromium.

## 26. Supported data scale

Not data-driven. Body content size is limited only by the consumer; the body scrolls.

## 27. Usage examples

```ts
import { Drawer } from '@absoluteui/components/drawer';

const editor = Drawer.create({
  title: 'Edit customer',
  size: 'lg',
  actions: [
    { label: 'Cancel', value: 'cancel' },
    { label: 'Save', value: 'save', variant: 'primary' },
  ],
});
editor.open();
```

More examples, type-checked in CI: `metadata/drawer/examples.json`.

## 28. Edge cases

- `closeOnEscape: false` also blocks repeated Escape presses. Chrome would otherwise let the second Escape through without user activation.
- A non-modal drawer yields Escape to a modal dialog opened elsewhere, because it is inert behind that dialog.
- Escape closes a non-modal drawer when it is the topmost overlay, even if focus is in the page.
- Destroying an open drawer releases the scroll lock and overlay registration, and restores focus.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DRAWER_TITLE` | configuration | Missing or blank title. |
| `DRAWER_OPTIONS` | configuration | Invalid `modal` or `actions`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration, such as an unknown `placement`. |

A failed construction or update leaves no rendering, listeners, overlay registration, or subscriptions behind, and a failed `update()` keeps the previous options.

## 30. Known limitations

- Non-modal drawers are not in the top layer. They use `z-index: 1000`, so page content with a higher stacking context can cover them.
- The element's `dir` follows the configured direction (default `'ltr'`), not the document's `dir` attribute.
- Slide animations need `@starting-style` and `transition-behavior: allow-discrete`. Older browsers open and close without animation.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Switching `modal` after creation.
- Swipe-to-dismiss gestures.
- HTML strings as content: pass a `Node` instead.

## 32. TypeScript definitions

```ts
type DrawerPlacement = 'start' | 'end' | 'top' | 'bottom';
type DrawerSide = 'left' | 'right' | 'top' | 'bottom';
type DrawerCloseReason = 'escape' | 'backdrop' | 'close-button' | 'action' | 'programmatic';
interface DrawerAction { label: string; value: string; variant?: ButtonVariant; autofocus?: boolean }
interface DrawerCloseDetail { returnValue: string; reason: DrawerCloseReason }
interface DrawerOptions {
  title: string;
  description?: string;
  content?: Node | string;
  actions?: readonly DrawerAction[];
  modal?: boolean;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<{ close: IconRef }>;
  placement?: DrawerPlacement;
  size?: 'sm' | 'md' | 'lg';
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
}
type DrawerUpdateOptions = Partial<Omit<DrawerOptions, 'modal'>>;
```

## 33. Vanilla JS example

```ts
import { Drawer } from '@absoluteui/components/drawer';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/drawer/style.css';

const filters = Drawer.create({ title: 'Filters', modal: false, placement: 'start', size: 'sm' });
document.querySelector('#toggle-filters')?.addEventListener('click', () => {
  if (filters.isOpen) filters.close();
  else filters.open();
});
```

## 34. Angular example

`<aui-drawer>` renders its projected content as the drawer body (a live embedded view). Bind `[(open)]`: it opens and closes the drawer and follows user dismissals. `modal` is read once at creation.

```ts
import { Component, signal } from '@angular/core';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiDrawer } from '@absoluteui/angular/drawer';

@Component({
  selector: 'app-orders',
  imports: [AuiButton, AuiDrawer],
  template: `
    <button type="button" auiButton variant="secondary" (click)="filtersOpen.set(true)">Filters</button>
    <aui-drawer title="Filters" placement="end" [modal]="false" [open]="filtersOpen()" (closed)="closed()">
      <p>Filter controls</p>
    </aui-drawer>`,
})
export class OrdersComponent {
  readonly filtersOpen = signal(false);

  closed(): void {
    this.filtersOpen.set(false);
    // re-run the query
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
