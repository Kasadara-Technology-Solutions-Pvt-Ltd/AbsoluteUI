# Dialog

> Package: `@absoluteui/components/dialog` | Styles: `@absoluteui/components/dialog/style.css` (requires the button styles for header and footer buttons) | Since 0.1.0 | Status: R0 reference component

## 1. Purpose

A modal dialog built on native `<dialog>.showModal()`. The browser provides top-layer rendering, an inert background, and focus containment. AbsoluteUI adds:
- deterministic Escape and backdrop policy;
- cancelable close events;
- focus restoration;
- scroll lock;
- localization.

## 2. Anatomy

```text
<dialog class="aui-dialog aui-dialog--{size}" aria-labelledby aria-describedby [role=alertdialog]>
  <header class="aui-dialog__header">
    <h2 class="aui-dialog__title">title</h2>
    <button class="aui-button aui-dialog__close" aria-label="Close">icon</button>
  </header>
  <p class="aui-dialog__description">description</p>
  <div class="aui-dialog__body">content</div>
  <footer class="aui-dialog__footer">action buttons</footer>
</dialog>
```

## 3. When to use

- Tasks that must be completed or dismissed before the user returns to the page.
- Confirmations of destructive actions (`role: 'alertdialog'`).

## 4. When not to use

- Non-blocking information: use an inline message, alert, or toast.
- Long multi-step flows: use a page or wizard.
- Content anchored to a trigger: use a popover.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLDialogElement` | Native dialog. |
| `body` | `HTMLDivElement` | Content area for consumer nodes. |
| `isOpen` | `boolean` | Open state. |

Options (`DialogOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `title` | `string` | - (required) | No | Accessible name / heading. |
| `description` | `string` | - | No | `aria-describedby` text. |
| `content` | `Node \| string` | - | No | Body; strings render as text. |
| `actions` | `DialogAction[]` | `[]` | No | Footer buttons `{ label, value, variant?, autofocus? }`. |
| `role` | `'dialog' \| 'alertdialog'` | `'dialog'` | No | Alert dialogs for urgent confirmations. |
| `icons` | `Partial<{ close: IconRef }>` | - | No | Icon slot overrides. |
| `closeOnEscape` | `boolean` | `true` | Yes | Escape requests close. |
| `closeOnBackdrop` | `boolean` | `false` | Yes | Backdrop click requests close. |
| `showCloseButton` | `boolean` | `true` | Yes | Header close button. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | Maximum inline size. |

## 6. Methods

| Method | Description |
|---|---|
| `Dialog.create(options, doc?)` | Create and append a closed dialog to `document.body`. |
| `open()` | Open modally, lock scroll, and remember focus for restoration. Emits `aui-open`. |
| `close(returnValue?)` | Close programmatically. Not cancelable. Emits `aui-close` with reason `programmatic`. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Close if open, then remove the element, listeners, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | When |
|---|---|---|---|---|
| `aui-open` | `null` | No | No | After opening. |
| `aui-cancel` | `{ returnValue, reason }` | No | Yes | Before a user-initiated close (Escape, backdrop, close button, action). Calling `preventDefault()` keeps the dialog open. |
| `aui-close` | `{ returnValue, reason }` | No | No | After closing. |

Lifecycle events do not bubble, which mirrors native `close`. A nested combobox's `aui-close` therefore never reaches the dialog's listeners.

## 8. Slots/content areas

`body` (or the `content` option) holds the dialog content.

## 9. CSS parts/hooks

`aui-dialog`, `aui-dialog--sm|md|lg`, `aui-dialog__header`, `__title`, `__close`, `__description`, `__body`, `__footer`, and `::backdrop`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/dialog/tokens.json` (28 tokens, verified in CI). Key tokens: `color-surface`, `color-border`, `color-backdrop`, `radius-lg`, `shadow-lg`, `dialog-width-sm|md|lg`, `font-size-lg`, `space-*`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-dialog-radius` (dialog corner radius; falls back to `radius-lg`), `--aui-dialog-bg` (dialog background; falls back to `color-surface`), `--aui-dialog-shadow` (dialog elevation; falls back to `shadow-lg`), `--aui-dialog-padding` (dialog inline padding; falls back to `space-5`), `--aui-dialog-backdrop` (modal backdrop; falls back to `color-backdrop`).

## 11. States

closed, open, and closing (an `aui-cancel` listener is pending).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | `open()` | open (focus moves inside, scroll locked) |
| open | Escape / backdrop / close button / action | `aui-cancel` -> closed, unless prevented |
| open | `close()` | closed (no `aui-cancel`) |
| open | consumer `<form method="dialog">` submit | closed (reason `action`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Open | Cycles through dialog controls; the background is inert. |
| Escape | `closeOnEscape: true` | `aui-cancel`, then close and restore focus. |
| Escape | `closeOnEscape: false` | No effect. The native close request is prevented, including repeated presses. |
| Escape | A nested overlay is open | Closes only the topmost overlay. |
| Enter / Space | Button focused | Activates. |

## 14. ARIA contract

- `aria-labelledby` -> title.
- `aria-describedby` -> description, when provided.
- `role="alertdialog"` when requested.
- The close button has a localized `aria-label` ("Close").

## 15. Accessibility notes

- Initial focus goes to the action with `autofocus: true`, otherwise the first focusable element (native dialog focusing steps).
- For alert dialogs, set `autofocus` on the least destructive action.
- On close, focus returns to the element that was focused before `open()`.
- Verified with axe (WCAG 2.2 AA) in 3 themes.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Width is `min(size token, 100vw - 2rem)` and height is capped at `100dvh - 2rem`; the body scrolls. Below 480px, footer actions stack full-width.

## 17. RTL behavior

Logical properties throughout; the close button sits at the inline end.

## 18. Theme behavior

Token-driven surface, border, radius, shadow, and backdrop. Forced-colors mode uses a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { dialog: { closeOnBackdrop: true, size: 'lg' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults. All configurable options are dynamic and re-render the open dialog.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.close` (default `close`), resolved through the global icon provider/registry.

## 23. Security behavior

Title, description, and string content use `textContent`. No HTML parsing, no inline styles. Verified under a strict CSP with Trusted Types enforced.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per open/close: one `showModal()` call, one scroll-lock reference, and one focus restore point. Budget: `open()` under 16 ms in headless Chromium (performance test).

## 26. Supported data scale

Not data-driven. Body content size is limited only by the consumer; the body scrolls.

## 27. Usage examples

```ts
import { Dialog } from '@absoluteui/components/dialog';

const confirm = Dialog.create({
  title: 'Delete project?',
  role: 'alertdialog',
  actions: [
    { label: 'Cancel', value: 'cancel', autofocus: true },
    { label: 'Delete', value: 'delete', variant: 'danger' },
  ],
});
confirm.open();
```

More examples, type-checked in CI: `metadata/dialog/examples.json`.

## 28. Edge cases

- `closeOnEscape: false` also blocks repeated Escape presses. Chrome would otherwise let the second Escape through without user activation.
- Escape in a focused combobox that has a value but a closed listbox clears the combobox first, per the APG.
- Destroying an open dialog releases the scroll lock and restores focus.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DIALOG_TITLE` | configuration | Missing or blank title. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- The close transition is not animated; the open transition uses `@starting-style` and is removed under reduced motion.
- Only modal dialogs are supported.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Non-modal dialogs.
- HTML strings as content: pass a `Node` instead.

## 32. TypeScript definitions

```ts
type DialogCloseReason = 'escape' | 'backdrop' | 'close-button' | 'action' | 'programmatic';
interface DialogAction { label: string; value: string; variant?: ButtonVariant; autofocus?: boolean }
interface DialogCloseDetail { returnValue: string; reason: DialogCloseReason }
interface DialogOptions {
  title: string;
  description?: string;
  content?: Node | string;
  actions?: readonly DialogAction[];
  role?: 'dialog' | 'alertdialog';
  icons?: Partial<{ close: IconRef }>;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

## 33. Vanilla JS example

```ts
import { Dialog } from '@absoluteui/components/dialog';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/dialog/style.css';

const d = Dialog.create({ title: 'Settings', content: 'Preferences are saved automatically.' });
document.querySelector('#open')?.addEventListener('click', () => {
  d.open();
});
```

## 34. Angular example

`<aui-dialog>` renders its projected content as the dialog body (a live embedded view). Bind `[(open)]`: it opens and closes the dialog and follows user dismissals (Escape, backdrop, close button, actions). `(closed)` carries the `returnValue` of the action.

```ts
import { Component, signal } from '@angular/core';
import type { DialogAction, DialogCloseDetail } from '@absoluteui/components/dialog';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiDialog } from '@absoluteui/angular/dialog';

@Component({
  selector: 'app-delete-file',
  imports: [AuiButton, AuiDialog],
  template: `
    <button type="button" auiButton variant="danger" (click)="confirming.set(true)">Delete file</button>
    <aui-dialog title="Delete report.pdf?" role="alertdialog" [actions]="actions" [open]="confirming()" (closed)="closed($event)">
      <p>The file is removed for everyone. This cannot be undone.</p>
    </aui-dialog>`,
})
export class DeleteFileComponent {
  readonly confirming = signal(false);
  readonly actions: DialogAction[] = [
    { label: 'Cancel', value: 'cancel', variant: 'secondary', autofocus: true },
    { label: 'Delete', value: 'delete', variant: 'danger' },
  ];

  closed(detail: DialogCloseDetail): void {
    this.confirming.set(false);
    if (detail.returnValue === 'delete') {
      // delete the file
    }
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiButton } from '@absoluteui/react/button';
import { AuiDialog } from '@absoluteui/react/dialog';

export function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AuiButton onClick={() => { setOpen(true); }}>Delete file</AuiButton>
      <AuiDialog title="Delete file?" role="alertdialog" open={open} onClose={() => { setOpen(false); }}
        actions={[{ label: 'Cancel', value: 'cancel' }, { label: 'Delete', value: 'delete', variant: 'danger' }]}>
        <p>This cannot be undone.</p>
      </AuiDialog>
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiButton } from '@absoluteui/vue/button';
import { AuiDialog } from '@absoluteui/vue/dialog';
const open = ref(false);
const actions = [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete', value: 'delete', variant: 'danger' as const }];
</script>

<template>
  <AuiButton @click="open = true">Delete file</AuiButton>
  <AuiDialog v-model:open="open" title="Delete file?" role="alertdialog" :actions="actions">
    <p>This cannot be undone.</p>
  </AuiDialog>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
