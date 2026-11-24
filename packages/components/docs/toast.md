# Toast

> Package: `@absoluteui/components/toast` | Styles: `@absoluteui/components/toast/style.css` (requires the button styles for action and dismiss buttons) | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Transient notifications, stacked in a labelled region. A `Toaster` owns one region: a `<section aria-label="Notifications">` rendered in the top layer with `popover="manual"` while it has toasts. The `toast()` function uses a lazily created default toaster for the document.

AbsoluteUI adds:
- one announcement per toast through the shared live regions: polite for info and success, assertive for warning and error;
- no focus stealing;
- timers that pause on hover and focus (WCAG 2.2.1), with error toasts persistent by default;
- a hotkey (default Alt+T) that reaches the newest toast, and Escape to dismiss it;
- a first-in, first-out queue beyond `max` visible toasts.

## 2. Anatomy

```text
<section class="aui-toaster aui-toaster--{position}" aria-label="Notifications" popover="manual">
  <ol class="aui-toaster__list">
    <li class="aui-toaster__item">
      <div class="aui-toast aui-toast--{tone}" role="group" tabindex="-1" aria-labelledby="{id}-text">
        <span class="aui-toast__icon">icon (aria-hidden)</span>
        <div class="aui-toast__text" id="{id}-text">
          <span class="aui-toast__tone">Error: (visually hidden)</span>
          <p class="aui-toast__title">title</p>
          <p class="aui-toast__message">message</p>
        </div>
        <div class="aui-toast__actions"><button class="aui-button">Undo</button></div>
        <button class="aui-button aui-toast__dismiss" aria-label="Dismiss notification">icon</button>
      </div>
    </li>
  </ol>
</section>
```

## 3. When to use

- Confirmation of a completed background action: saved, sent, copied.
- Non-blocking notices with at most one follow-up action, such as Undo.
- Errors from background work, which persist until dismissed by default.

## 4. When not to use

- Information the user must not miss, or must act on: use Alert or Dialog.
- Field validation errors: show them at the field and in the Error Summary.
- Status tied to a place on the page: use Inline Message.
- Long or rich content: toasts are text only, with one action.

## 5. Public properties

`Toaster`:

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | Region `<section>`; `aui-open` and `aui-close` fire here. |
| `count` | `number` | Visible toasts. |
| `queued` | `number` | Toasts waiting for a free slot. |
| `options` | `Readonly<ToasterOptions>` | Current toaster options. |

`ToastHandle` (returned by `show()` and `toast()`): `id`, `dismiss()`, `update(options)`.

Toaster options (`ToasterOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `position` | `'bottom-end' \| 'bottom-start' \| 'top-end' \| 'top-start' \| 'top-center' \| 'bottom-center'` | `'bottom-end'` | Yes | Region corner (logical). |
| `max` | `number` (1-20) | `3` | Yes | Visible limit; further toasts queue first-in, first-out. |
| `duration` | `number` (ms, 0-3,600,000) | `5000` | Yes | Auto-dismiss delay; `0` = persistent. Applies to toasts shown afterwards. |
| `hotkey` | `string \| null` | `'Alt+T'` | Yes | Focus the newest toast; `null` disables. |
| `locale` | `string` | common `locale` | Yes (inherited) | Region label, prefixes, dismiss label. |
| `icons` | `Partial<ToastIcons>` | - | No | Icon slot overrides. |

Toast options (`ToastOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | - (required) | Message text. |
| `tone` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | Icon, colors, prefix, and announcement politeness. |
| `title` | `string` | - | Optional title. |
| `duration` | `number` | configured `duration`; `0` for `error` | Per-toast override. |
| `action` | `{ label: string; onAction?: () => void }` | - | One action button. |

## 6. Methods

| Method | Description |
|---|---|
| `Toaster.create(options?, doc?)` | Create a region, appended to `doc.body`. |
| `show(options)` | Show a toast, or queue it when `max` are visible. Returns a `ToastHandle`. |
| `clear()` | Dismiss all visible toasts and drop the queue. |
| `update(options)` | Merge and apply toaster options. |
| `destroy()` | Remove the region, timers, listeners, and subscriptions. No events are emitted. |
| `handle.dismiss()` | Close the toast (reason `programmatic`), or drop it from the queue. |
| `handle.update(options)` | Merge toast options. A visible toast is re-announced and its timer restarts. |
| `toast(options, doc?)` | Show a toast in the default toaster for `doc`. |

## 7. Events

Fired on `toaster.element`:

| Event | Detail | Bubbles | Cancelable | When |
|---|---|---|---|---|
| `aui-open` | `{ id }` | No | No | A toast became visible (after leaving the queue, if it waited). |
| `aui-close` | `{ id, reason: 'timeout' \| 'dismiss' \| 'action' \| 'programmatic' }` | No | No | A visible toast closed. |

Queued toasts that are dropped before they appear emit nothing.

## 8. Slots/content areas

None. Toasts are text only.

## 9. CSS parts/hooks

`aui-toaster`, `aui-toaster--{position}`, `aui-toaster__list`, `aui-toaster__item`, `aui-toast`, `aui-toast--info|success|warning|error`, `aui-toast__icon`, `__text`, `__tone`, `__title`, `__message`, `__actions`, `__dismiss`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/toast/tokens.json` (29 tokens, verified in CI). Key tokens: `toast-width`, `color-surface` under `color-{tone}-subtle`, `color-{tone}-fg`, `color-text`, `shadow-md`, `radius-md`, `duration-fast`, `easing-standard`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-toast-radius` (toast corner radius; falls back to `radius-md`), `--aui-toast-bg` (toast background; falls back to `color-surface`), `--aui-toast-shadow` (toast elevation; falls back to `shadow-md`).

## 11. States

Region: hidden (no toasts) or open. Toast: queued, visible, timer running, timer paused (hover or focus), persistent.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| - | `show()` with a free slot | visible (announced, `aui-open`) |
| - | `show()` with `max` visible | queued |
| queued | a visible toast closes | visible |
| visible | timer elapses | closed (`timeout`) |
| visible | pointer over region / focus inside | timer paused, resumes with remaining time |
| visible | dismiss button / Escape | closed (`dismiss`), focus returned |
| visible | action button | `onAction()`, then closed (`action`) |
| visible | `handle.dismiss()` / `clear()` | closed (`programmatic`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Alt+T (configurable) | Anywhere, toasts visible | Focuses the newest toast. |
| Tab / Shift+Tab | In the region | Moves through action and dismiss buttons and between toasts. |
| Escape | Focus in a toast | Dismisses it and returns focus to where it was before entering the region. |
| Enter / Space | Action button | Runs `onAction`, then closes. |
| Enter / Space | Dismiss button | Closes and returns focus. |

## 14. ARIA contract

- The region is a `<section>` named by `aria-label` ("Notifications"): a region landmark while it has toasts.
- Each toast is `role="group"` labelled by its text (tone prefix, title, message), with `tabindex="-1"` for the hotkey.
- Toasts are not live regions. Announcements go through `announce()` from `@absoluteui/utilities`: `polite` for info/success, `assertive` for warning/error. This prevents double announcement.
- The dismiss button has a localized `aria-label` ("Dismiss notification"). The icon is `aria-hidden`.

## 15. Accessibility notes

- Toasts never take focus; users reach them with the hotkey, or by Tab (the region follows page content in DOM order). Tell users about the hotkey, for example in your keyboard help.
- Timers pause while the pointer is over the region or focus is inside it. Errors persist unless given a `duration`. Keep durations of at least 5 seconds.
- DOM order matches visual order: the newest toast is nearest the viewport edge.
- While a modal dialog is open, everything outside it is inert. The region therefore moves into the open modal dialog when a toast is shown, and back to `document.body` when that dialog closes, so toasts stay above the dialog and remain operable.
- The shared live regions used by `announce()` are in `document.body`. While a modal dialog is open they are outside the dialog, so screen readers may not announce toasts (see section 30).
- The e2e axe run (WCAG 2.2 AA, 3 themes) and manual screen-reader verification are pending.

## 16. Responsive behavior

Region width is `min(toast-width, 100vw - 2rem)`, pinned `space-4` from the configured edges or centred. Text wraps.

## 17. RTL behavior

Positions use logical insets: `end` is the right edge in LTR and the left edge in RTL. Icon and border sit at the inline start.

## 18. Theme behavior

An opaque `color-surface` background under a `color-{tone}-subtle` tint (matching the contrast gate's backdrop), `color-{tone}-fg` icon and border, `color-text` text, and `shadow-md`. Forced-colors mode removes the tint and uses `CanvasText` borders. The entry slide/fade uses `@starting-style` and is removed under `prefers-reduced-motion` or `animation: 'none'`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { toast: { position: 'top-end', max: 4, duration: 8000, hotkey: 'Alt+N' } } });
```

## 20. Component configuration support

`Toaster.create(options)` and `toaster.update(options)` override global and theme defaults; per-toast `duration` overrides both. All options are dynamic. Changing `duration` affects toasts shown afterwards; changing `max` reveals queued toasts at once.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.info` (default `info`), `icons.success` (`check-circle`), `icons.warning` (`alert-triangle`), `icons.error` (`alert-circle`), `icons.dismiss` (`close`), set per toaster.

## 23. Security behavior

Title, message, and action label use `textContent`; they are never parsed as HTML. No inline styles (the visually hidden prefix uses the CSSOM). CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Message text is copied into the shared live regions for announcement.

## 25. Performance characteristics

Constant work per toast; at most `max` toasts are in the DOM. One document `keydown` listener per toaster, for the hotkey.

## 26. Supported data scale

`max` up to 20 visible toasts. The queue is unbounded; avoid producing toasts in loops.

## 27. Usage examples

```ts
import { toast } from '@absoluteui/components/toast';

const upload = toast({ message: 'Uploading report.pdf', duration: 0 });
upload.update({ tone: 'success', message: 'Uploaded report.pdf', duration: 5000 });
toast({ tone: 'error', title: 'Sync failed', message: 'Changes will be retried.' });
```

More examples, type-checked in CI: `metadata/toast/examples.json`.

## 28. Edge cases

- Focus inside a toast that closes (Escape, dismiss, action, or timeout) returns to the element focused before entering the region. If that element is gone, focus moves to the newest remaining toast.
- A toast shown while the region is hovered or focused starts its timer only after the pointer leaves and focus leaves.
- Toasts already visible when a modal dialog opens stay beneath it until the next toast is shown.
- If the region is removed from the DOM by other code, `toast()` creates a new default toaster.
- `show()` after `destroy()` throws `TOASTER_DESTROYED`. Handles of closed toasts are inert.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TOAST_OPTIONS` | configuration | Missing or blank message, unknown tone, invalid duration, or invalid action. |
| `TOASTER_DESTROYED` | runtime | `show()` on a destroyed toaster. |
| `ICON_UNKNOWN` | configuration | Unknown icon override. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration (e.g. `max: 0`). |

Invalid toaster options throw before the region is appended; invalid toast options throw before anything is shown.

## 30. Known limitations

- Announcements while a modal dialog is open depend on the shared live regions, which sit outside the dialog (planned fix in `@absoluteui/utilities`).
- There is no exit animation; toasts are removed immediately.
- `matchesHotkey` compares `event.key`. On macOS, Option+letter produces a different character, so `Alt+T` may not match there; configure another hotkey.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML or `Node` content.
- More than one action per toast.
- Swipe-to-dismiss gestures.

## 32. TypeScript definitions

```ts
type ToastTone = 'info' | 'success' | 'warning' | 'error';
type ToastPosition = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start' | 'top-center' | 'bottom-center';
type ToastCloseReason = 'timeout' | 'dismiss' | 'action' | 'programmatic';
interface ToastAction { label: string; onAction?: () => void }
interface ToastOptions { tone?: ToastTone; title?: string; message: string; duration?: number; action?: ToastAction }
interface ToastHandle { readonly id: string; dismiss(): void; update(options: Partial<ToastOptions>): void }
interface ToastIcons { info: IconRef; success: IconRef; warning: IconRef; error: IconRef; dismiss: IconRef }
interface ToasterOptions {
  position?: ToastPosition;
  max?: number;
  duration?: number;
  hotkey?: string | null;
  locale?: string;
  icons?: Partial<ToastIcons>;
}
interface ToastOpenDetail { id: string }
interface ToastCloseDetail { id: string; reason: ToastCloseReason }
declare function toast(options: ToastOptions, doc?: Document): ToastHandle;
```

## 33. Vanilla JS example

```ts
import { Toaster } from '@absoluteui/components/toast';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/toast/style.css';

const toaster = Toaster.create({ position: 'top-end' });
document.querySelector('#archive')?.addEventListener('click', () => {
  toaster.show({
    message: 'Conversation archived.',
    action: {
      label: 'Undo',
      onAction: () => {
        document.querySelector('#restore')?.dispatchEvent(new Event('click'));
      },
    },
  });
});
```

## 34. Angular example

The toaster has no host element, so the adapter provides the `AuiToaster` service instead of a directive. `provideAuiToaster(options)` is optional configuration. The region is created lazily in the browser on the first `show()`; on the server `show()` returns `null`.

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAbsoluteUI } from '@absoluteui/angular';
import { provideAuiToaster } from '@absoluteui/angular/toast';
import { AppComponent } from './app.component';

bootstrapApplication(AppComponent, { providers: [provideAbsoluteUI(), provideAuiToaster({ position: 'top-end', max: 3 })] });
```

```ts
// save-button.component.ts
import { Component, inject } from '@angular/core';
import { AuiToaster } from '@absoluteui/angular/toast';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-save-button',
  imports: [AuiButton],
  template: `<button type="button" auiButton variant="primary" (click)="save()">Save</button>`,
})
export class SaveButtonComponent {
  private readonly toaster = inject(AuiToaster);

  save(): void {
    this.toaster.show({ tone: 'success', message: 'Changes saved' });
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
