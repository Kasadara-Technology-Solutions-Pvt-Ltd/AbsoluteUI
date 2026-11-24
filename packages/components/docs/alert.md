# Alert

> Package: `@absoluteui/components/alert` | Styles: `@absoluteui/components/alert/style.css` (requires the button styles for action and dismiss buttons) | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A prominent message block for page- or section-level status. `Alert` renders a tone icon, a visually hidden localized tone prefix ("Error:"), an optional title, the message, optional action buttons, and an optional dismiss button. Tone is never conveyed by color alone. Alerts are static by default; set `live` to announce messages that are inserted or changed after the page has loaded.

## 2. Anatomy

```text
<div class="aui-alert aui-alert--{tone} [aui-alert--dismissible]" [role=status|alert]>
  <span class="aui-alert__icon">icon (aria-hidden)</span>
  <div class="aui-alert__content">
    <span class="aui-alert__tone">Error: (visually hidden)</span>
    <div class="aui-alert__title">title</div>
    <div class="aui-alert__message">message</div>
    <div class="aui-alert__actions">action buttons</div>
  </div>
  <button class="aui-button aui-alert__dismiss" aria-label="Dismiss">icon</button>
</div>
```

## 3. When to use

- Page- or section-level status that must stay visible until read or dismissed, such as a failed save or a service notice.
- Messages with follow-up actions such as Retry or View details.
- Messages inserted in response to user actions, with `live: 'polite'` or `'assertive'`.

## 4. When not to use

- Short status next to a control or value: use Inline Message.
- Transient confirmations that need no action: use Toast.
- Field validation errors: use the field's error message and the Error Summary.
- Decisions that must block the page: use Dialog with `role: 'alertdialog'`.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element; receives the role and classes. |
| `isDismissed` | `boolean` | Whether the alert has been dismissed (hidden). |
| `options` | `Readonly<AlertOptions>` | Current options. |

Options (`AlertOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `message` | `string \| Node` | - (required) | No | Message; strings render as text. |
| `tone` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | No | Icon, colors, and tone prefix. |
| `title` | `string` | - | No | Optional title. |
| `live` | `'off' \| 'polite' \| 'assertive'` | `'off'` | No | `polite` sets `role="status"`, `assertive` sets `role="alert"`. |
| `actions` | `AlertAction[]` | `[]` | No | Buttons `{ label, value, variant? }` emitting `aui-action`. |
| `icons` | `Partial<AlertIcons>` | - | No | Icon slot overrides. |
| `dismissible` | `boolean` | `false` | Yes | Render a dismiss button. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the tone prefix and dismiss label. |

## 6. Methods

| Method | Description |
|---|---|
| `Alert.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge and apply options. In a live alert, changed content is announced. |
| `dismiss()` | Emit cancelable `aui-dismiss` (reason `programmatic`), then hide unless prevented. Returns whether the alert was dismissed. |
| `destroy()` | Remove rendering, role, classes, and the configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | When |
|---|---|---|---|---|
| `aui-action` | `{ value }` | Yes | No | An action button was activated. |
| `aui-dismiss` | `{ reason: 'dismiss-button' \| 'programmatic' }` | No | Yes | Before the alert hides. `preventDefault()` keeps it visible. |

`aui-dismiss` is a lifecycle event and does not bubble, so a nested alert never reaches a container's listener.

## 8. Slots/content areas

The `message` option accepts a `Node` for rich content, such as a paragraph with a link. Title and string messages are text only.

## 9. CSS parts/hooks

`aui-alert`, `aui-alert--info|success|warning|error`, `aui-alert--dismissible`, `aui-alert__icon`, `__content`, `__tone`, `__title`, `__message`, `__actions`, `__dismiss`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/alert/tokens.json` (21 tokens, verified in CI). Key tokens: `color-{tone}-subtle` (background), `color-{tone}-fg` (icon and border), `color-text` (body text), `border-width-strong`, `radius-md`, `icon-size-md`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-alert-radius` (alert corner radius; falls back to `radius-md`), `--aui-alert-border-width` (alert boundary thickness; falls back to `border-width`).

## 11. States

info, success, warning, error; with title; with actions; dismissible; dismissed (hidden); live polite; live assertive.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| visible | Dismiss button / `dismiss()` | `aui-dismiss` -> hidden, unless prevented |
| visible | `update({ message })` | visible with new content (announced when live) |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves through action buttons, then the dismiss button. |
| Enter / Space | Action button | Emits `aui-action`. |
| Enter / Space | Dismiss button | Emits `aui-dismiss`, then hides. |

## 14. ARIA contract

- `live: 'off'`: no role; the alert is ordinary content.
- `live: 'polite'`: `role="status"` (implicit `aria-live="polite"`, `aria-atomic="true"`).
- `live: 'assertive'`: `role="alert"` (implicit `aria-live="assertive"`, `aria-atomic="true"`).
- The icon is `aria-hidden`; the tone is conveyed by the visually hidden prefix.
- The dismiss button has a localized `aria-label` ("Dismiss").

## 15. Accessibility notes

- Live roles only announce content inserted or changed after the live region exists. An alert rendered with the initial page is not announced, which is correct for static content. For dynamic messages, insert the host with the alert already rendered (most screen readers announce a `role="alert"` element when it is inserted), or create it with `live` set and change it with `update()`.
- Use `assertive` only for errors and time-sensitive warnings.
- The alert never moves focus. When the user dismisses it with its button, focus would fall to the page; handle `aui-dismiss` and move focus to a sensible element, such as the heading of the section.
- The e2e axe run (WCAG 2.2 AA, 3 themes) and manual screen-reader verification are pending.

## 16. Responsive behavior

Fills its container. Text wraps (`overflow-wrap: anywhere`), and action buttons wrap onto new lines.

## 17. RTL behavior

Logical properties: the icon and the strong tone border are at the inline start, and the dismiss button is at the inline end.

## 18. Theme behavior

Each tone uses `color-{tone}-subtle` for the background, `color-{tone}-fg` for the icon and border, and `color-text` for text. All these pairs are in the contrast gate. Forced-colors mode draws `CanvasText` borders and icons.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { alert: { dismissible: true } } });
```

## 20. Component configuration support

Instance options override global and theme defaults. `dismissible` and `locale` are dynamic: configuration changes re-render existing alerts.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.info` (default `info`), `icons.success` (`check-circle`), `icons.warning` (`alert-triangle`), `icons.error` (`alert-circle`), `icons.dismiss` (`close`), resolved through the global icon provider/registry.

## 23. Security behavior

Title and string messages use `textContent`; `Node` messages are inserted as given, and the consumer owns them. No HTML parsing. The visually hidden prefix is styled through the CSSOM, which is CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Dismissal is not remembered.

## 25. Performance characteristics

Constant work per render. Action buttons are rebuilt only when `actions` changes, so a focused action keeps focus across `update()` calls.

## 26. Supported data scale

Not data-driven.

## 27. Usage examples

```ts
import { Alert } from '@absoluteui/components/alert';

const host = document.querySelector<HTMLElement>('#save-status');
if (host) {
  Alert.create(host, {
    tone: 'error',
    live: 'assertive',
    title: 'Could not save',
    message: 'Check your connection and try again.',
    actions: [{ label: 'Retry', value: 'retry', variant: 'primary' }],
    dismissible: true,
  });
}
```

More examples, type-checked in CI: `metadata/alert/examples.json`.

## 28. Edge cases

- Calling `dismiss()` on an already dismissed alert returns `false` and emits nothing.
- `update()` on a dismissed alert updates the content, but the alert stays hidden.
- A `Node` message is moved into the alert. Pass a new node, or the same node again, to update it.
- Setting `live` on an alert that is already on the page does not announce the existing content.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `ALERT_OPTIONS` | configuration | Missing or blank message, unknown tone or live value, or invalid action. |
| `ICON_UNKNOWN` | configuration | Unknown icon override. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified.

## 30. Known limitations

- Focus is not moved after dismissal (see section 15).
- Dismissal is not persisted.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML strings as the message: pass a `Node` instead.
- Automatic timeouts: use Toast.

## 32. TypeScript definitions

```ts
type AlertTone = 'info' | 'success' | 'warning' | 'error';
type AlertLive = 'off' | 'polite' | 'assertive';
interface AlertAction { label: string; value: string; variant?: ButtonVariant }
interface AlertIcons { info: IconRef; success: IconRef; warning: IconRef; error: IconRef; dismiss: IconRef }
interface AlertOptions {
  message: string | Node;
  tone?: AlertTone;
  title?: string;
  live?: AlertLive;
  actions?: readonly AlertAction[];
  dismissible?: boolean;
  locale?: string;
  icons?: Partial<AlertIcons>;
}
interface AlertActionDetail { value: string }
interface AlertDismissDetail { reason: 'dismiss-button' | 'programmatic' }
```

## 33. Vanilla JS example

```ts
import { Alert } from '@absoluteui/components/alert';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/alert/style.css';

const host = document.querySelector<HTMLElement>('#notice');
if (host) {
  const notice = Alert.create(host, { tone: 'warning', message: 'Your session expires in 5 minutes.', dismissible: true });
  host.addEventListener('aui-dismiss', () => {
    document.querySelector<HTMLElement>('main h1')?.focus();
  });
  notice.update({ title: 'Session ending' });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiAlert } from '@absoluteui/angular/alert';

@Component({
  selector: 'app-save-status',
  imports: [AuiAlert],
  template: `<aui-alert tone="error" live="assertive" title="Could not save" [message]="message" [dismissible]="true" [actions]="actions" (action)="onAction($event.value)"></aui-alert>`,
})
export class SaveStatusComponent {
  readonly message = 'Check your connection and try again.';
  readonly actions = [{ label: 'Retry', value: 'retry' }];
  onAction(value: string): void {
    if (value === 'retry') {
      // retry the save
    }
  }
}
```

`(dismissed)` receives only the event detail; to keep the alert visible with `preventDefault()`, bind the DOM event `(aui-dismiss)` instead.

## 35. React example

```tsx
import { AuiAlert } from '@absoluteui/react/alert';

export function Example() {
  return <AuiAlert tone="warning" title="Heads up" message="Your trial ends in 3 days." />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiAlert } from '@absoluteui/vue/alert';
</script>

<template>
  <AuiAlert tone="warning" title="Heads up" message="Your trial ends in 3 days." />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
